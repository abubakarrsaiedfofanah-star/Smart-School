import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return reply({ error: 'Portal account invitations are not configured.' }, 503)

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Sign in as a school administrator first.' }, 401)

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData.user) return reply({ error: 'Your session is no longer valid. Sign in again.' }, 401)

  let body: { email?: string; full_name?: string; role?: string; student_id?: string }
  try { body = await request.json() } catch { return reply({ error: 'Send a valid invitation form.' }, 400) }
  const email = body.email?.trim().toLowerCase() || ''
  const fullName = body.full_name?.trim() || ''
  const role = body.role
  const studentId = body.student_id || null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply({ error: 'Enter a valid email address.' }, 400)
  if (fullName.length < 2 || fullName.length > 160) return reply({ error: 'Enter the person’s full name.' }, 400)
  if (!['teacher', 'student', 'parent'].includes(role || '')) return reply({ error: 'Choose teacher, student, or parent access.' }, 400)
  if ((role === 'student' || role === 'parent') && !studentId) return reply({ error: 'Select the learner record for this account.' }, 400)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: actor, error: actorError } = await admin.from('profiles').select('id,role,school_id').eq('id', authData.user.id).maybeSingle()
  if (actorError || actor?.role !== 'school_admin' || !actor.school_id) return reply({ error: 'Only a school administrator can manage portal accounts.' }, 403)

  const { data: school, error: schoolError } = await admin.from('schools').select('id,name,status').eq('id', actor.school_id).maybeSingle()
  if (schoolError || !school || school.status !== 'active') return reply({ error: 'This school workspace is not active.' }, 403)

  if (studentId) {
    const { data: learner, error: learnerError } = await admin.from('students').select('id,profile_id').eq('id', studentId).eq('school_id', actor.school_id).maybeSingle()
    if (learnerError || !learner) return reply({ error: 'Choose a learner from your own school.' }, 400)
    if (role === 'student' && learner.profile_id) return reply({ error: 'This learner already has a portal account.' }, 409)
  }

  const { data: priorInvite } = await admin.from('school_portal_invites').select('id').eq('school_id', actor.school_id).ilike('email', email).is('accepted_at', null).maybeSingle()
  if (priorInvite) return reply({ error: 'An invitation for this email is already waiting.' }, 409)

  if (role === 'parent') {
    const { data: existingParent } = await admin.from('school_portal_invites').select('user_id').eq('school_id', actor.school_id).ilike('email', email).eq('role', 'parent').not('accepted_at', 'is', null).maybeSingle()
    if (existingParent) {
      const { data: guardian, error } = await admin.from('student_guardians').insert({ student_id: studentId, guardian_id: existingParent.user_id }).select().maybeSingle()
      if (error) return reply({ error: error.code === '23505' ? 'This parent is already linked to that learner.' : error.message }, 409)
      if (!guardian) return reply({ error: 'Could not link this parent to the learner.' }, 500)
      return reply({ message: `Existing parent account linked to the learner.` })
    }
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone: '', role: 'student', school_id: '' },
  })
  if (inviteError || !inviteData.user) return reply({ error: inviteError?.message || 'Could not send the invitation email.' }, 400)

  const userId = inviteData.user.id
  const { error: profileError } = await admin.from('profiles').update({ school_id: actor.school_id, full_name: fullName, role }).eq('id', userId)
  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return reply({ error: 'The account was invited but its school role could not be set. Please retry.' }, 500)
  }

  if (role === 'student') {
    const { error } = await admin.from('students').update({ profile_id: userId }).eq('id', studentId).eq('school_id', actor.school_id)
    if (error) {
      await admin.auth.admin.deleteUser(userId)
      return reply({ error: 'Could not link the student record to this portal account.' }, 500)
    }
  }
  if (role === 'parent') {
    const { error } = await admin.from('student_guardians').insert({ student_id: studentId, guardian_id: userId })
    if (error) {
      await admin.auth.admin.deleteUser(userId)
      return reply({ error: 'Could not link this parent to the selected learner.' }, 500)
    }
  }

  const { error: recordError } = await admin.from('school_portal_invites').insert({
    school_id: actor.school_id, user_id: userId, email, full_name: fullName, role, student_id: studentId, created_by: actor.id,
    accepted_at: inviteData.user.email_confirmed_at ? new Date().toISOString() : null,
  })
  if (recordError) {
    await admin.auth.admin.deleteUser(userId)
    return reply({ error: recordError.message }, 500)
  }

  return reply({ message: `Invitation sent to ${email}.`, school: school.name })
})
