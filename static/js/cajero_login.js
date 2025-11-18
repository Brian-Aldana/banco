document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('cajero-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            const res = await fetch('/cajero/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password})});
            if (res.ok) window.location.href = '/cajero';
            else { const data = await res.json(); document.getElementById('error-message').textContent = data.error; document.getElementById('error-message').style.display = 'block'; }
        } catch (e) { console.error(e); }
    });
});