// static/js/dashboard_cliente.js
document.addEventListener('DOMContentLoaded', () => {

    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    const statusDisplay = document.getElementById('status-display');
    const afiliacionSection = document.getElementById('afiliacion-section');
    const btnAfiliarme = document.getElementById('btn-afiliarme');
    const message = document.getElementById('message');

    // --- 1. Cargar Perfil del Cliente ---
    async function cargarPerfil() {
        try {
            const response = await fetch('/cliente/perfil');
            
            if (!response.ok) {
                // Si la sesión no es válida, redirigir al login
                if (response.status === 401) {
                    window.location.href = '/login';
                }
                throw new Error('No se pudo cargar el perfil.');
            }
            
            const data = await response.json();
            
            welcomeMessage.textContent = `Hola, ${data.nombre}`;
            
            if (data.tipo_cliente === 'Afiliado') {
                statusDisplay.textContent = 'AFILIADO';
                statusDisplay.className = 'status-badge afiliado';
                afiliacionSection.style.display = 'none'; // Ocultar botón si ya es afiliado
                message.textContent = '¡Gracias por ser parte de nuestro banco!';
                message.style.color = 'green';
            } else {
                statusDisplay.textContent = 'NO AFILIADO';
                statusDisplay.className = 'status-badge no-afiliado';
                afiliacionSection.style.display = 'block'; // Mostrar botón
            }

        } catch (error) {
            console.error('Error:', error);
        }
    }

    // --- 2. Lógica del Botón "Afiliarme" ---
    btnAfiliarme.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro que deseas volverte un cliente afiliado?')) {
            return;
        }

        try {
            const response = await fetch('/cliente/afiliarme', {
                method: 'POST',
            });

            const data = await response.json(); // Leer la respuesta incluso si es un error

            if (response.ok) {
                message.textContent = '¡Felicidades! Ahora eres un cliente afiliado.';
                message.style.color = 'green';
                // Recargar el perfil para mostrar el nuevo estado
                cargarPerfil();
            } else {
                // Mostrar el error específico de la API (ej. "Ya eras un cliente afiliado")
                message.textContent = `Error: ${data.error || 'Falló la solicitud.'}`;
                message.style.color = 'red';
            }

        } catch (error) {
            message.textContent = `Error: ${error.message}`;
            message.style.color = 'red';
        }
    });

    // --- 3. Lógica de Logout ---
    logoutButton.addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch('/cliente/logout', { method: 'POST' });
        alert("Sesión cerrada. Serás redirigido al menú principal.");
        window.location.href = '/';
    });

    // --- Carga Inicial ---
    cargarPerfil();
});