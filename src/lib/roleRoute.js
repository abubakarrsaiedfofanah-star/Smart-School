export const roleRoute=role=>({super_admin:'/super-admin',school_admin:'/school-admin',teacher:'/teacher',student:'/student',parent:'/parent'})[role]||'/portal'
