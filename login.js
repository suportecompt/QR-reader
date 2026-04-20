// 1. Redirección automática si ya hay sesión guardada
if (localStorage.getItem('supabase_token')) {
    window.location.href = "scanner.html";
}

document.getElementById('btn-login').onclick = async () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    if (!user || !pass) return;

    // Feedback visual de carga
    btn.disabled = true;
    btn.innerText = "Verificando...";

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
            // Guardamos el token en localStorage para persistencia (y le añadimos "Bearer " por si acaso, 
            // aunque Supabase a veces lo pide y a veces no, es el estándar seguro)
            localStorage.setItem('supabase_token', 'Bearer ' + data.access_token);
            
            // Redirigimos al escáner
            window.location.href = "scanner.html";
        } else {
            // Error de autenticación
            throw new Error(data.error_description || data.error || "Error al iniciar sesión");
        }

    } catch (err) {
        console.error("Error de login:", err);
        // 2. Mostrar el mensaje de error real en la pantalla
        errorMsg.innerText = err.message; 
        errorMsg.style.display = "block";
        setTimeout(() => { errorMsg.style.display = "none"; }, 3000);
    } finally {
        btn.disabled = false;
        btn.innerText = "Entrar al Sistema";
    }
};

// 3. Permitir el uso de Enter solo cuando se está escribiendo en los inputs
const inputs = document.querySelectorAll('#username, #password');
inputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-login').click();
        }
    });
});