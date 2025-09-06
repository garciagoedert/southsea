import { loadComponents, setupUIListeners } from './common-ui.js';

function setupProfilePage() {
    const userNameDisplay = document.getElementById('user-name-display');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userAvatar = document.getElementById('user-avatar');
    const editProfileForm = document.getElementById('edit-profile-form');
    const nameInput = document.getElementById('name');
    const passwordInput = document.getElementById('password');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const logoutBtn = document.getElementById('logout-btn');

    const loggedInUserName = sessionStorage.getItem('userName');
    const allUsers = getAllUsers();
    let currentUser = allUsers.find(user => user.name === loggedInUserName);

    if (currentUser) {
        // Populate user info
        userNameDisplay.textContent = currentUser.name;
        userEmailDisplay.textContent = currentUser.email;
        nameInput.value = currentUser.name;
        // Load profile picture from localStorage or use default
        const storedPic = localStorage.getItem(`profilePic_${currentUser.email}`);
        if (storedPic) {
            currentUser.profilePicture = storedPic;
        }
        userAvatar.src = currentUser.profilePicture;

    } else {
        // Redirect to login if no user is found in session
        window.location.href = 'login.html';
        return; // Stop execution if no user
    }

    // Handle profile update
    editProfileForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const newName = nameInput.value;
        const newPassword = passwordInput.value;
        const newPictureFile = profilePictureInput.files[0];

        const updatedData = { name: newName };
        if (newPassword) {
            updatedData.password = newPassword;
        }

        const updateAndRefresh = () => {
            if (updateUser(currentUser.email, updatedData)) {
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
            updateAndRefresh();
        }
    });

    // Handle logout
    logoutBtn.addEventListener('click', function() {
        sessionStorage.clear();
        // Note: localStorage is not cleared on logout to persist profile pictures
        window.location.href = 'login.html';
    });

    setupUIListeners();
}

loadComponents(setupProfilePage);
