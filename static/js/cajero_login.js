// static/js/cajero_login.js
document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('cajero-login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        errorMessage.style.display = 'none';

        try {
            const response = await fetch('/cajero/login', {
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
                // ¡Éxito! El servidor creó la sesión
                window.location.href = '/cajero'; // Redirigimos al panel de cajero
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