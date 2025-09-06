const users = [
    { name: 'Marketing', email: 'marketing@southsea.com.br', password: 'Southsea@!', isAdmin: false, profilePicture: 'default-profile.svg' },
    { name: 'Paulo', email: 'paulo@southsea.com.br', password: 'Pg1308@!', isAdmin: true, profilePicture: 'default-profile.svg' },
    { name: 'Alefy', email: 'alefy@southsea.com.br', password: 'Ams_1308@!', isAdmin: false, profilePicture: 'default-profile.svg' },
    { name: 'Bruno', email: 'bruno@southsea.com.br', password: 'Bruno2025@!', isAdmin: false, profilePicture: 'default-profile.svg' }
];

function findUser(email, password) {
    return users.find(user => user.email === email && user.password === password);
}

window.getAllUsers = function() {
    return users;
}

function addUser(user) {
    users.push(user);
}

function updateUser(email, updatedData) {
    const userIndex = users.findIndex(user => user.email === email);
    if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...updatedData };
        return true;
    }
    return false;
}

function deleteUser(email) {
    const userIndex = users.findIndex(user => user.email === email);
    if (userIndex !== -1) {
        users.splice(userIndex, 1);
        return true;
    }
    return false;
}
