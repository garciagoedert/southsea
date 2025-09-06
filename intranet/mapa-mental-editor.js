import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, collection, onSnapshot, addDoc, updateDoc, serverTimestamp, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, app } from './firebase-config.js';
import { loadComponents, setupUIListeners } from './common-ui.js';
import HistoryManager from './history-manager.js';

// --- INITIALIZATION ---
const auth = getAuth(app);
const urlParams = new URLSearchParams(window.location.search);
const mapId = urlParams.get('mapId');
if (!mapId) {
    alert("ID do mapa não fornecido!");
    window.location.href = 'mapas-mentais.html';
}

// --- UI ELEMENTS ---
const canvas = document.getElementById('canvas');
const addNodeBtn = document.getElementById('add-node-btn');
const connectNodesBtn = document.getElementById('connect-nodes-btn');
const deleteNodeBtn = document.getElementById('delete-node-btn');
const colorPicker = document.getElementById('color-picker');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

// --- GLOBAL STATE ---
let nodes = {};
let lines = {};
let selectedNodes = [];
let isConnecting = false;
let panzoomInstance;
const historyManager = new HistoryManager();
let debounceTimer = null;

// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            loadComponents(() => setupUIListeners());
            setupNodeListener();
            setupConnectionListener();
        } else {
            window.location.href = 'login.html';
        }
    } else {
        window.location.href = 'login.html';
    }
});

// --- DATA HANDLING & HISTORY ---
function setupNodeListener() {
    const nodesCollection = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'mind-maps', mapId, 'nodes');
    onSnapshot(nodesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const nodeData = { id: change.doc.id, ...change.doc.data() };
            if (change.type === "added") {
                if (!nodes[nodeData.id]) createNodeElement(nodeData);
            }
            if (change.type === "modified") {
                updateNodeElement(nodeData);
            }
            if (change.type === "removed") {
                removeNodeElement(nodeData.id);
            }
        });
    });
}

function setupConnectionListener() {
    const connectionsCollection = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'mind-maps', mapId, 'connections');
    onSnapshot(connectionsCollection, (snapshot) => {
        Object.values(lines).forEach(line => line.remove());
        lines = {};
        snapshot.forEach(doc => {
            const conn = { id: doc.id, ...doc.data() };
            if (nodes[conn.from] && nodes[conn.to]) {
                lines[conn.id] = new LeaderLine(nodes[conn.from].el, nodes[conn.to].el, { color: 'rgba(203, 213, 225, 0.7)', size: 4, path: 'fluid' });
            }
        });
    });
}

function updateHistoryButtons() {
    undoBtn.disabled = !historyManager.canUndo();
    redoBtn.disabled = !historyManager.canRedo();
}

async function executeAction(action) {
    const batch = writeBatch(db);
    action.forEach(op => {
        const ref = doc(db, op.path);
        if (op.type === 'add' || op.type === 'set') batch.set(doc(db, op.path.substring(0, op.path.lastIndexOf('/')), op.path.substring(op.path.lastIndexOf('/') + 1)), op.data);
        if (op.type === 'update') batch.update(ref, op.data);
        if (op.type === 'delete') batch.delete(ref);
    });
    await batch.commit();
}

// --- UI & CANVAS ---
function initializePanzoom() {
    const elem = document.getElementById('canvas');
    panzoomInstance = Panzoom(elem, {
        maxScale: 5, minScale: 0.2, contain: 'outside', canvas: true,
        handleStartEvent: (e) => {
            if (e.target.closest('.node') || e.target.closest('#toolbar')) return;
            e.preventDefault();
        }
    });
    elem.parentElement.addEventListener('wheel', panzoomInstance.zoomWithWheel);
    elem.addEventListener('panzoomchange', () => Object.values(lines).forEach(line => line.position()));
}

function createNodeElement(nodeData) {
    const nodeEl = document.createElement('div');
    nodeEl.id = nodeData.id;
    nodeEl.className = 'node';
    nodeEl.style.left = `${nodeData.position.x}px`;
    nodeEl.style.top = `${nodeData.position.y}px`;
    if (nodeData.color) nodeEl.style.backgroundColor = nodeData.color;

    const textarea = document.createElement('textarea');
    textarea.className = 'node-textarea';
    textarea.value = nodeData.text;
    textarea.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => updateNodeText(nodeData.id, textarea.value), 500);
    });

    nodeEl.appendChild(textarea);
    canvas.appendChild(nodeEl);
    nodes[nodeData.id] = { el: nodeEl, data: nodeData };

    makeDraggable(nodeEl);
    nodeEl.addEventListener('click', (e) => handleNodeSelection(e, nodeData.id));
}

function updateNodeElement(nodeData) {
    const existing = nodes[nodeData.id];
    if (existing) {
        existing.el.style.left = `${nodeData.position.x}px`;
        existing.el.style.top = `${nodeData.position.y}px`;
        if (nodeData.color) existing.el.style.backgroundColor = nodeData.color;
        const textarea = existing.el.querySelector('textarea');
        if (textarea.value !== nodeData.text) textarea.value = nodeData.text;
        existing.data = nodeData;
        Object.values(lines).forEach(line => line.position());
    }
}

function removeNodeElement(nodeId) {
    if (nodes[nodeId]) {
        nodes[nodeId].el.remove();
        delete nodes[nodeId];
    }
}

function handleNodeSelection(e, nodeId) {
    const nodeEl = nodes[nodeId].el;
    if (isConnecting) {
        if (selectedNodes.length === 0) {
            selectedNodes.push(nodeId);
            nodeEl.classList.add('selected');
        } else if (selectedNodes.length === 1 && selectedNodes[0] !== nodeId) {
            createConnection(selectedNodes[0], nodeId);
            nodes[selectedNodes[0]].el.classList.remove('selected');
            selectedNodes = [];
            isConnecting = false;
            connectNodesBtn.classList.remove('bg-blue-600');
        }
    } else {
        const isSelected = nodeEl.classList.contains('selected');
        if (!e.metaKey && !e.ctrlKey) {
            Object.values(nodes).forEach(n => n.el.classList.remove('selected'));
            selectedNodes = [];
        }
        if (isSelected && (e.metaKey || e.ctrlKey)) {
            nodeEl.classList.remove('selected');
            selectedNodes = selectedNodes.filter(id => id !== nodeId);
        } else {
            nodeEl.classList.add('selected');
            if (!selectedNodes.includes(nodeId)) selectedNodes.push(nodeId);
        }
    }
    updateToolbar();
}

function updateToolbar() {
    deleteNodeBtn.disabled = selectedNodes.length === 0;
    colorPicker.disabled = selectedNodes.length === 0;
}

function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let startPos = {};

    element.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (e.target.tagName.toLowerCase() === 'textarea') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        startPos = { x: element.offsetLeft, y: element.offsetTop };
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        const newTop = element.offsetTop - pos2;
        const newLeft = element.offsetLeft - pos1;
        element.style.top = `${newTop}px`;
        element.style.left = `${newLeft}px`;
        if (newLeft + element.offsetWidth + 100 > canvas.offsetWidth) canvas.style.width = `${canvas.offsetWidth + 500}px`;
        if (newTop + element.offsetHeight + 100 > canvas.offsetHeight) canvas.style.height = `${canvas.offsetHeight + 500}px`;
        Object.values(lines).forEach(line => line.position());
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        updateNodePosition(element.id, startPos, { x: element.offsetLeft, y: element.offsetTop });
    }
}

// --- DATABASE INTERACTIONS ---
async function createNewNode(x, y) {
    const newNodeId = doc(collection(db, 'temp')).id;
    const nodeData = { text: "Novo nó", position: { x, y }, color: "#334155", createdAt: serverTimestamp() };
    const action = {
        undo: [{ type: 'delete', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${newNodeId}` }],
        redo: [{ type: 'set', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${newNodeId}`, data: nodeData }]
    };
    await executeAction(action.redo);
    historyManager.add(action);
    updateHistoryButtons();
}

async function updateNodePosition(nodeId, oldPos, newPos) {
    const action = {
        undo: [{ type: 'update', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${nodeId}`, data: { position: oldPos } }],
        redo: [{ type: 'update', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${nodeId}`, data: { position: newPos } }]
    };
    await executeAction(action.redo);
    historyManager.add(action);
    updateHistoryButtons();
}

async function updateNodeText(nodeId, newText) {
    const oldText = nodes[nodeId].data.text;
    const action = {
        undo: [{ type: 'update', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${nodeId}`, data: { text: oldText } }],
        redo: [{ type: 'update', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${nodeId}`, data: { text: newText } }]
    };
    await executeAction(action.redo);
    historyManager.add(action);
    updateHistoryButtons();
}

async function updateNodeColor(newColor) {
    const nodesToUpdate = selectedNodes.map(id => ({ id, oldColor: nodes[id].data.color }));
    const action = {
        undo: nodesToUpdate.map(n => ({ type: 'update', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${n.id}`, data: { color: n.oldColor } })),
        redo: nodesToUpdate.map(n => ({ type: 'update', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${n.id}`, data: { color: newColor } }))
    };
    await executeAction(action.redo);
    historyManager.add(action);
    updateHistoryButtons();
}

async function deleteSelectedNodes() {
    if (selectedNodes.length === 0) return;
    const nodesToDelete = selectedNodes.map(id => ({ id, ...nodes[id].data }));
    const action = {
        undo: nodesToDelete.map(n => ({ type: 'set', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${n.id}`, data: { text: n.text, position: n.position, color: n.color, createdAt: n.createdAt } })),
        redo: nodesToDelete.map(n => ({ type: 'delete', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/nodes/${n.id}` }))
    };
    await executeAction(action.redo);
    historyManager.add(action);
    updateHistoryButtons();
    selectedNodes = [];
    updateToolbar();
}

async function createConnection(fromId, toId) {
    const newConnId = doc(collection(db, 'temp')).id;
    const connData = { from: fromId, to: toId };
    const action = {
        undo: [{ type: 'delete', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/connections/${newConnId}` }],
        redo: [{ type: 'set', path: `artifacts/${db.app.options.appId}/public/data/mind-maps/${mapId}/connections/${newConnId}`, data: connData }]
    };
    await executeAction(action.redo);
    historyManager.add(action);
    updateHistoryButtons();
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', initializePanzoom);

document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'textarea') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoBtn.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redoBtn.click(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteNodeBtn.click(); }
});

undoBtn.addEventListener('click', async () => {
    const action = historyManager.undo();
    if (action) await executeAction(action);
    updateHistoryButtons();
});

redoBtn.addEventListener('click', async () => {
    const action = historyManager.redo();
    if (action) await executeAction(action);
    updateHistoryButtons();
});

canvas.addEventListener('dblclick', (e) => {
    if (e.target === canvas) {
        const transform = panzoomInstance.getTransform();
        const x = (e.clientX - transform.x) / transform.scale;
        const y = (e.clientY - transform.y) / transform.scale;
        createNewNode(x, y);
    }
});

canvas.addEventListener('click', (e) => {
    if (e.target === canvas) {
        Object.values(nodes).forEach(n => n.el.classList.remove('selected'));
        selectedNodes = [];
        updateToolbar();
    }
});

addNodeBtn.addEventListener('click', () => {
    const canvasRect = canvas.getBoundingClientRect();
    const centerX = (window.innerWidth - canvasRect.left) / 2;
    const centerY = (window.innerHeight - canvasRect.top) / 2;
    createNewNode(centerX, centerY);
});

deleteNodeBtn.addEventListener('click', deleteSelectedNodes);

connectNodesBtn.addEventListener('click', () => {
    isConnecting = !isConnecting;
    connectNodesBtn.classList.toggle('bg-blue-600', isConnecting);
    if (isConnecting) alert("Selecione o nó de origem e depois o nó de destino.");
    Object.values(nodes).forEach(n => n.el.classList.remove('selected'));
    selectedNodes = [];
    updateToolbar();
});

colorPicker.addEventListener('input', (e) => {
    if (selectedNodes.length > 0) {
        updateNodeColor(e.target.value);
    }
});
