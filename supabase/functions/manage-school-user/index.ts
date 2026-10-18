import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = (Deno.env.get('SMARTSCHOOL_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean)
const originAllowed = (request: Request) => allowedOrigins.includes(request.headers.get('Origin') || '')
const cors = (request: Request) => ({
  ...(originAllowed(request) ? { 'Access-Control-Allow-Origin': request.headers.get('Origin')! } : {}),
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
})

Deno.serve(async request => {
  const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(request), 'Content-Type': 'application/json' } })
  if (request.method === 'OPTIONS') return originAllowed(request) ? new Response('ok', { headers: cors(request) }) : new Response(null, { status: 403 })
  if (!originAllowed(request)) return respond({ error: 'This app origin is not allowed.' }, 403)
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey || !allowedOrigins.length) return respond({ error: 'Portal account invitations are not configured.' }, 503)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in as a school administrator first.' }, 401)

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData.user) return respond({ error: 'Your session is no longer valid. Sign in again.' }, 401)

  let body: { email?: string; full_name?: string; role?: string; student_id?: string }
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 16_384) return respond({ error: 'Invitation request is too large.' }, 413)
    body = JSON.parse(rawBody)
  } catch { return respond({ error: 'Send a valid invitation form.' }, 400) }
  const email = body.email?.trim().toLowerCase() || ''
  const fullName = body.full_name?.trim() || ''
  const role = body.role
  const studentId = body.student_id || null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return respond({ error: 'Enter a valid email address.' }, 400)
  if (fullName.length < 2 || fullName.length > 160) return respond({ error: 'Enter the person’s full name.' }, 400)
  if (!['teacher', 'student', 'parent'].includes(role || '')) return respond({ error: 'Choose teacher, student, or parent access.' }, 400)
  if ((role === 'student' || role === 'parent') && !studentId) return respond({ error: 'Select the learner record for this account.' }, 400)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: actor, error: actorError } = await admin.from('profiles').select('id,role,school_id').eq('id', authData.user.id).maybeSingle()
  if (actorError || actor?.role !== 'school_admin' || !actor.school_id) return respond({ error: 'Only a school administrator can manage portal accounts.' }, 403)

  const { data: school, error: schoolError } = await admin.from('schools').select('id,name,status').eq('id', actor.school_id).maybeSingle()
  if (schoolError || !school || school.status !== 'active') return respond({ error: 'This school workspace is not active.' }, 403)

  const { data: invitationAllowed, error: invitationLimitError } = await admin.rpc('consume_portal_invitation_attempt', { p_actor_id: authData.user.id, p_school_id: actor.school_id })
  if (invitationLimitError) return respond({ error: 'Invitations are temporarily unavailable. Try again later.' }, 503)
  if (!invitationAllowed) return respond({ error: 'Invitation limit reached. Wait until the next hour before inviting more accounts.' }, 429)

  if (studentId) {
    const { data: learner, error: learnerError } = await admin.from('students').select('id,profile_id').eq('id', studentId).eq('school_id', actor.school_id).maybeSingle()
    if (learnerError || !learner) return respond({ error: 'Choose a learner from your own school.' }, 400)
    if (role === 'student' && learner.profile_id) return respond({ error: 'This learner already has a portal account.' }, 409)
  }

  const { data: priorInvite } = await admin.from('school_portal_invites').select('id').eq('school_id', actor.school_id).ilike('email', email).is('accepted_at', null).maybeSingle()
  if (priorInvite) return respond({ error: 'An invitation for this email is already waiting.' }, 409)

  if (role === 'parent') {
    const { data: existingParent } = await admin.from('school_portal_invites').select('user_id').eq('school_id', actor.school_id).ilike('email', email).eq('role', 'parent').not('accepted_at', 'is', null).maybeSingle()
    if (existingParent) {
      const { data: guardian, error } = await admin.from('student_guardians').insert({ student_id: studentId, guardian_id: existingParent.user_id }).select().maybeSingle()
      if (error) return respond({ error: error.code === '23505' ? 'This parent is already linked to that learner.' : error.message }, 409)
      if (!guardian) return respond({ error: 'Could not link this parent to the learner.' }, 500)
      return respond({ message: `Existing parent account linked to the learner.` })
    }
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone: '', role: 'student', school_id: '' },
  })
  if (inviteError || !inviteData.user) return respond({ error: inviteError?.message || 'Could not send the invitation email.' }, 400)

  const userId = inviteData.user.id
  const { error: profileError } = await admin.from('profiles').update({ school_id: actor.school_id, full_name: fullName, role }).eq('id', userId)
  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return respond({ error: 'The account was invited but its school role could not be set. Please retry.' }, 500)
  }

  if (role === 'student') {
    const { error } = await admin.from('students').update({ profile_id: userId }).eq('id', studentId).eq('school_id', actor.school_id)
    if (error) {
      await admin.auth.admin.deleteUser(userId)
      return respond({ error: 'Could not link the student record to this portal account.' }, 500)
    }
  }
  if (role === 'parent') {
    const { error } = await admin.from('student_guardians').insert({ student_id: studentId, guardian_id: userId })
    if (error) {
      await admin.auth.admin.deleteUser(userId)
      return respond({ error: 'Could not link this parent to the selected learner.' }, 500)
    }
  }

  const { error: recordError } = await admin.from('school_portal_invites').insert({
    school_id: actor.school_id, user_id: userId, email, full_name: fullName, role, student_id: studentId, created_by: actor.id,
    accepted_at: inviteData.user.email_confirmed_at ? new Date().toISOString() : null,
  })
  if (recordError) {
    await admin.auth.admin.deleteUser(userId)
    return respond({ error: recordError.message }, 500)
  }

  return respond({ message: `Invitation sent to ${email}.`, school: school.name })
})
