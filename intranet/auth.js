import { db } from './firebase-config.js';
import { 
    doc, setDoc, getDoc, addDoc, collection, getDocs, deleteDoc, updateDoc, query, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export async function findUser(email, password) {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email), where("password", "==", password));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        return null;
    }
    return { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
}

export async function getAllUsers() {
    const users = [];
    try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        querySnapshot.forEach((doc) => {
            users.push({ id: doc.id, ...doc.data() });
        });
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
    }
    return users;
}

export async function addUser(user) {
    try {
        // Use o email como ID do documento para evitar duplicatas
        const userRef = doc(db, 'users', user.email);
        await setDoc(userRef, user);
    } catch (error) {
        console.error("Erro ao adicionar usuário:", error);
    }
}

export async function updateUser(email, updatedData) {
    try {
        const userRef = doc(db, 'users', email);
        await updateDoc(userRef, updatedData);
        return true;
    } catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        return false;
    }
}

export async function deleteUser(email) {
    try {
        const userRef = doc(db, 'users', email);
        await deleteDoc(userRef);
        return true;
    } catch (error) {
        console.error("Erro ao excluir usuário:", error);
        return false;
    }
}
