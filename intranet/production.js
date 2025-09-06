import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './firebase-config.js';

export async function duplicateCardToProduction(prospect) {
    try {
        const productionCollection = collection(db, 'artifacts', appId, 'public', 'data', 'prospects');
        const newCard = { ...prospect };
        delete newCard.id;
        newCard.pagina = 'Produção';
        newCard.status = 'Produção // V1';
        newCard.createdAt = serverTimestamp();
        newCard.updatedAt = serverTimestamp();

        await addDoc(productionCollection, newCard);
    } catch (error) {
        console.error("Error duplicating card to production:", error);
    }
}
