// static/js/login.js
document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        errorMessage.style.display = 'none';

        try {
            const response = await fetch('/cliente/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            if (response.ok) {
                // --- ¡CAMBIO AQUÍ! ---
                // Redirigir al nuevo dashboard de cliente
                window.location.href = '/dashboard_cliente'; 
                
            } else {
                const data = await response.json();
                errorMessage.textContent = data.error || 'Error al iniciar sesión';
                errorMessage.style.display = 'block';
            }

        } catch (error) {
            console.error('Error de red:', error);
            errorMessage.textContent = 'Error de conexión. Inténtalo de nuevo.';
            errorMessage.style.display = 'block';
        }
    });
});