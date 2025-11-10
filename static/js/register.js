// static/js/register.js
document.addEventListener('DOMContentLoaded', () => {

    const registerForm = document.getElementById('register-form');
    const messageElement = document.getElementById('message');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 

        const nombre_completo = document.getElementById('nombre_completo').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const fecha_nacimiento = document.getElementById('fecha_nacimiento').value;
        const tiene_discapacidad = document.getElementById('tiene_discapacidad').checked;

        messageElement.style.display = 'none';
        messageElement.style.color = 'red';

        try {
            const response = await fetch('/cliente/registrar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nombre_completo,
                    email,
                    password,
                    fecha_nacimiento,
                    tiene_discapacidad
                })
            });

            const data = await response.json();

            if (response.ok) { // 201 Creado
                // --- ¡CAMBIO AQUÍ! ---
                // El backend (app.py) ahora inicia sesión al registrar.
                // Lo enviamos directo a su dashboard.
                messageElement.textContent = "¡Registro exitoso! Redirigiendo a tu perfil...";
                messageElement.style.color = 'green';
                messageElement.style.display = 'block';

                setTimeout(() => {
                    window.location.href = '/dashboard_cliente';
                }, 1500);

            } else {
                messageElement.textContent = data.error || 'Error en el registro.';
                messageElement.style.display = 'block';
            }

        } catch (error) {
            console.error('Error de red:', error);
            messageElement.textContent = 'Error de conexión. Inténtalo de nuevo.';
            messageElement.style.display = 'block';
        }
    });
});