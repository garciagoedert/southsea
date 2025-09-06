// Funções de Log Geral
const generalLog = {
    add: (user, action, details) => {
        const logEntry = {
            timestamp: new Date().toISOString(),
            user,
            action,
            details,
        };

        // Adicionar ao localStorage
        let logs = JSON.parse(localStorage.getItem('generalLog')) || [];
        logs.push(logEntry);
        localStorage.setItem('generalLog', JSON.stringify(logs));
    },

    get: () => {
        return JSON.parse(localStorage.getItem('generalLog')) || [];
    },

    clear: () => {
        localStorage.removeItem('generalLog');
    },
};
