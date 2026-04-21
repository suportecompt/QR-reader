// 1. Redirecionamento automático se já houver sessão guardada
if (localStorage.getItem('supabase_token')) {
    window.location.href = "scanner.html";
}

document.getElementById('btn-login').onclick = async () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    if (!user || !pass) return;

    // Feedback visual de carregamento
    btn.disabled = true;
    btn.innerText = "A verificar...";

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}${CONFIG.ENDPOINTS.LOGIN}`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: user, 
                password: pass
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Guardamos o token no localStorage para persistência (e adicionamos "Bearer " por precaução, 
            // embora o Supabase por vezes peça e outras não, é o padrão seguro)
            localStorage.setItem('supabase_token', 'Bearer ' + data.access_token);
            
            // Redirecionamos para o scanner
            window.location.href = "scanner.html";
        } else {
            // Erro de autenticação
            throw new Error(data.error_description || data.error || "Erro ao iniciar sessão");
        }

    } catch (err) {
        console.error("Erro de login:", err);
        // 2. Mostrar a mensagem de erro real no ecrã
        errorMsg.innerText = err.message; 
        errorMsg.style.display = "block";
        setTimeout(() => { errorMsg.style.display = "none"; }, 3000);
    } finally {
        btn.disabled = false;
        btn.innerText = "Entrar no Sistema";
    }
};

// 3. Permitir o uso do Enter apenas quando se está a escrever nos inputs
const inputs = document.querySelectorAll('#username, #password');
inputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-login').click();
        }
    });
});