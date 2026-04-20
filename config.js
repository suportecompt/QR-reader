const CONFIG = Object.freeze({
    // 1. Base de Datos e Autenticación
    SUPABASE_URL: 'https://supabase1.myserver.pt', 
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjEyMzQ1Njc4LCJleHAiOjI2MTIzNDU2Nzh9.szPPmYS9Pa9WENwHSgsrd7i_YaYLmmORiVqA9jguyGc',

    // 2. Rutas de la API (Endpoints)
    ENDPOINTS: {
        LOGIN: '/auth/v1/token?grant_type=password',
        LOGOUT: '/auth/v1/logout',
        DOCUMENTS: '/rest/v1/documents'
    }
});