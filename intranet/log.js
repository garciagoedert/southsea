import { loadComponents, setupUIListeners } from './common-ui.js';

function initializeLogPage() {
    const logTableBody = document.getElementById('log-table-body');
    if (!logTableBody) {
        console.error('Log table body not found!');
        return;
    }

    const logData = generalLog.get() || [];
    
    const sortedLogData = logData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    logTableBody.innerHTML = sortedLogData.map(logEntry => `
        <tr class="bg-gray-800 hover:bg-gray-700/50">
            <td class="p-3 text-sm text-gray-400">${new Date(logEntry.timestamp).toLocaleString('pt-BR')}</td>
            <td class="p-3 font-medium text-gray-200">${logEntry.user || 'system'}</td>
            <td class="p-3 text-gray-300">${logEntry.action}</td>
            <td class="p-3 text-gray-300">${logEntry.details}</td>
        </tr>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    loadComponents(() => {
        setupUIListeners();
        initializeLogPage();
    });
});
