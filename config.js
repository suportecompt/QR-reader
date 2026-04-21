const CONFIG = Object.freeze({
    // 1. Base de Dados e Autenticação
    SUPABASE_URL: 'https://supabase1.myserver.pt', 
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjEyMzQ1Njc4LCJleHAiOjI2MTIzNDU2Nzh9.szPPmYS9Pa9WENwHSgsrd7i_YaYLmmORiVqA9jguyGc',

    // 2. Rotas da API (Endpoints)
    // Nota: Mantemos LOGIN/LOGOUT para o caso de decidir reativar a sessão mais tarde
    ENDPOINTS: {
        LOGIN: '/auth/v1/token?grant_type=password',
        LOGOUT: '/auth/v1/logout',
        DOCUMENTS: '/rest/v1/documents'
    },

    // 3. Configuração de Armazenamento (Opcional, mas útil para evitar "Magic Strings")
    STORAGE: {
        BUCKET_NAME: 'qr_invoices',
        BASE_PATH: '/storage/v1/object'
    }
});