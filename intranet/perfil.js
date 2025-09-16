import { loadComponents, setupUIListeners } from './common-ui.js';
import { getAllUsers, updateUser } from './auth.js';

async function setupProfilePage() {
    const userNameDisplay = document.getElementById('user-name-display');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userAvatar = document.getElementById('user-avatar');
    const editProfileForm = document.getElementById('edit-profile-form');
    const nameInput = document.getElementById('name');
    const passwordInput = document.getElementById('password');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const logoutBtn = document.getElementById('logout-btn');

    // Use o currentUser do sessionStorage que foi salvo no login
    const currentUserJSON = sessionStorage.getItem('currentUser');
    if (!currentUserJSON) {
        window.location.href = 'login.html';
        return;
    }
    
    const currentUser = JSON.parse(currentUserJSON);

    // Populate user info
    userNameDisplay.textContent = currentUser.name;
    userEmailDisplay.textContent = currentUser.email;
    nameInput.value = currentUser.name;
    
    const storedPic = localStorage.getItem(`profilePic_${currentUser.email}`);
    if (storedPic) {
        userAvatar.src = storedPic;
    } else if (currentUser.profilePicture) {
        userAvatar.src = currentUser.profilePicture;
    } else {
        userAvatar.src = 'default-profile.svg';
    }

    // Handle profile update
    editProfileForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const newName = nameInput.value;
        const newPassword = passwordInput.value;
        const newPictureFile = profilePictureInput.files[0];

        const updatedData = { name: newName };
        if (newPassword) {
            updatedData.password = newPassword;
        }

        const updateAndRefresh = async () => {
            const success = await updateUser(currentUser.email, updatedData);
            if (success) {
                // Atualiza o objeto currentUser e o sessionStorage
                currentUser.name = newName;
                sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                sessionStorage.setItem('userName', newName);

                userNameDisplay.textContent = newName;
                if (updatedData.profilePicture) {
                    userAvatar.src = updatedData.profilePicture;
                    localStorage.setItem(`profilePic_${currentUser.email}`, updatedData.profilePicture);
                }
                alert('Perfil atualizado com sucesso!');
                passwordInput.value = '';
                profilePictureInput.value = '';
            } else {
                alert('Erro ao atualizar o perfil.');
            }
        };

        if (newPictureFile) {
            const reader = new FileReader();
            reader.onload = function(event) {
                updatedData.profilePicture = event.target.result;
                updateAndRefresh();
            };
            reader.readAsDataURL(newPictureFile);
        } else {
            await updateAndRefresh();
        }
    });

    // Handle logout
    logoutBtn.addEventListener('click', function() {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    setupUIListeners();
}

loadComponents(setupProfilePage);
