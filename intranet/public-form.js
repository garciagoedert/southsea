import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './firebase-config.js';
import { showNotification } from './common-ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const formTitle = document.getElementById('form-title');
    const sectionsContainer = document.getElementById('sections-container');
    const publicForm = document.getElementById('public-form');
    const submitBtn = document.getElementById('submit-btn');
    const backBtn = document.getElementById('back-btn');
    const nextBtn = document.getElementById('next-btn');

    // State
    let formInstanceRef = null;
    let formDefinition = null;
    let currentSectionIndex = 0;

    const params = new URLSearchParams(window.location.search);
    const instanceId = params.get('instanceId');

    if (!instanceId) {
        formTitle.textContent = 'Link de formulário inválido ou ausente.';
        publicForm.style.display = 'none';
        return;
    }

    // --- VALIDATION & MASK FUNCTIONS ---
    const validateCPF = (cpf) => {
        cpf = cpf.replace(/[^\d]+/g,'');
        if(cpf === '' || cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
        let add = 0;
        for (let i=0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
        let rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cpf.charAt(9))) return false;
        add = 0;
        for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
        rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        return rev === parseInt(cpf.charAt(10));
    };

    const validateCNPJ = (cnpj) => {
        cnpj = cnpj.replace(/[^\d]+/g,'');
        if(cnpj === '' || cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
        let tamanho = cnpj.length - 2;
        let numeros = cnpj.substring(0,tamanho);
        let digitos = cnpj.substring(tamanho);
        let soma = 0;
        let pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) {
          soma += numeros.charAt(tamanho - i) * pos--;
          if (pos < 2) pos = 9;
        }
        let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        if (resultado != digitos.charAt(0)) return false;
        tamanho = tamanho + 1;
        numeros = cnpj.substring(0,tamanho);
        soma = 0;
        pos = tamanho - 7;
        for (let i = tamanho; i >= 1; i--) {
          soma += numeros.charAt(tamanho - i) * pos--;
          if (pos < 2) pos = 9;
        }
        resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        return resultado == digitos.charAt(1);
    };

    const validateTel = (tel) => {
        tel = tel.replace(/\D/g, '');
        return tel.length >= 10; // Basic validation for (XX) XXXX-XXXX or (XX) XXXXX-XXXX
    };

    const validateEmail = (email) => {
        const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    };

    const maskCPFCNPJ = (value) => {
        value = value.replace(/\D/g, "");
        if (value.length <= 11) {
            value = value.replace(/(\d{3})(\d)/, "$1.$2");
            value = value.replace(/(\d{3})(\d)/, "$1.$2");
            value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        } else {
            value = value.replace(/^(\d{2})(\d)/, "$1.$2");
            value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
            value = value.replace(/\.(\d{3})(\d)/, ".$1/$2");
            value = value.replace(/(\d{4})(\d)/, "$1-$2");
        }
        return value;
    };

    const maskTel = (value) => {
        value = value.replace(/\D/g, "");
        value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
        value = value.replace(/(\d)(\d{4})$/, "$1-$2");
        return value;
    };

    const maskCEP = (value) => {
        value = value.replace(/\D/g, "");
        value = value.replace(/^(\d{5})(\d)/, "$1-$2");
        return value;
    };

    const fetchAddressFromCEP = async (cep, fieldName) => {
        cep = cep.replace(/\D/g, "");
        if (cep.length !== 8) return;

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) throw new Error('CEP não encontrado.');
            const data = await response.json();
            if (data.erro) {
                showNotification('CEP não encontrado.', 'error');
                return;
            }
            
            document.querySelector(`input[name="${fieldName}-rua"]`).value = data.logradouro;
            document.querySelector(`input[name="${fieldName}-bairro"]`).value = data.bairro;
            document.querySelector(`input[name="${fieldName}-cidade"]`).value = data.localidade;
            document.querySelector(`input[name="${fieldName}-estado"]`).value = data.uf;
            document.querySelector(`input[name="${fieldName}-numero"]`).focus();

        } catch (error) {
            console.error("Erro ao buscar CEP:", error);
            showNotification("Não foi possível buscar o endereço para este CEP.", 'error');
        }
    };

    const addInputListeners = () => {
        document.querySelectorAll('input[data-mask="cpf_cnpj"]').forEach(input => {
            const applyMask = (e) => e.target.value = maskCPFCNPJ(e.target.value);
            input.addEventListener('input', applyMask);
            input.addEventListener('change', applyMask);
            input.addEventListener('blur', applyMask);
        });
        document.querySelectorAll('input[data-mask="tel"]').forEach(input => {
            const applyMask = (e) => e.target.value = maskTel(e.target.value);
            input.addEventListener('input', applyMask);
            input.addEventListener('change', applyMask);
            input.addEventListener('blur', applyMask);
        });
        document.querySelectorAll('input[data-mask="cep"]').forEach(input => {
            input.addEventListener('input', (e) => e.target.value = maskCEP(e.target.value));
            input.addEventListener('blur', (e) => fetchAddressFromCEP(e.target.value, e.target.dataset.fieldName));
        });
    };

    const validateSection = () => {
        let isValid = true;
        const inputs = sectionsContainer.querySelectorAll('input[required], textarea[required]');
        inputs.forEach(input => {
            let fieldIsValid = input.checkValidity();
            const type = input.getAttribute('type');
            const mask = input.dataset.mask;

            if (fieldIsValid) {
                if (type === 'email' && !validateEmail(input.value)) {
                    fieldIsValid = false;
                } else if (mask === 'tel' && !validateTel(input.value)) {
                    fieldIsValid = false;
                } else if (mask === 'cpf_cnpj' && !(validateCPF(input.value) || validateCNPJ(input.value))) {
                    fieldIsValid = false;
                }
            }
            
            if (!fieldIsValid) {
                isValid = false;
                input.style.borderColor = 'red';
            } else {
                input.style.borderColor = 'green';
            }
        });
        return isValid;
    };

    const renderCurrentSection = () => {
        sectionsContainer.innerHTML = '';
        const section = formDefinition.sections[currentSectionIndex];
        if (!section) return;

        let sectionHtml = '';
        section.fields.forEach(field => {
            const fieldName = (field.tag ? field.tag.replace(/##/g, '') : field.questionText);
            const commonInputClass = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm";

            sectionHtml += `<div class="mb-6">`;
            if (field.type === 'title') {
                sectionHtml += `<h1 class="text-3xl font-bold text-gray-900 mb-2">${field.text}</h1>`;
            } else if (field.type === 'subtitle') {
                sectionHtml += `<h2 class="text-xl text-gray-600 mb-4">${field.text}</h2>`;
            } else if (field.type === 'address') {
                const baseName = field.tag ? field.tag.replace(/##/g, '') : field.questionText;
                sectionHtml += `
                    <fieldset>
                        <legend class="block text-lg font-medium text-gray-800 mb-2">${field.questionText}</legend>
                        <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
                            <div class="md:col-span-2">
                                <label for="${baseName}-cep" class="block text-sm font-medium text-gray-700">CEP</label>
                                <input type="text" name="${baseName}-cep" id="${baseName}-cep" class="${commonInputClass}" data-mask="cep" data-field-name="${baseName}" maxlength="9" required>
                            </div>
                            <div class="md:col-span-4">
                                <label for="${baseName}-rua" class="block text-sm font-medium text-gray-700">Rua</label>
                                <input type="text" name="${baseName}-rua" id="${baseName}-rua" class="${commonInputClass}" required>
                            </div>
                            <div class="md:col-span-2">
                                <label for="${baseName}-numero" class="block text-sm font-medium text-gray-700">Número</label>
                                <input type="text" name="${baseName}-numero" id="${baseName}-numero" class="${commonInputClass}" required>
                            </div>
                            <div class="md:col-span-4">
                                <label for="${baseName}-complemento" class="block text-sm font-medium text-gray-700">Complemento</label>
                                <input type="text" name="${baseName}-complemento" id="${baseName}-complemento" class="${commonInputClass}">
                            </div>
                            <div class="md:col-span-3">
                                <label for="${baseName}-bairro" class="block text-sm font-medium text-gray-700">Bairro</label>
                                <input type="text" name="${baseName}-bairro" id="${baseName}-bairro" class="${commonInputClass}" required>
                            </div>
                            <div class="md:col-span-2">
                                <label for="${baseName}-cidade" class="block text-sm font-medium text-gray-700">Cidade</label>
                                <input type="text" name="${baseName}-cidade" id="${baseName}-cidade" class="${commonInputClass}" required>
                            </div>
                            <div class="md:col-span-1">
                                <label for="${baseName}-estado" class="block text-sm font-medium text-gray-700">Estado</label>
                                <input type="text" name="${baseName}-estado" id="${baseName}-estado" class="${commonInputClass}" required>
                            </div>
                        </div>
                    </fieldset>
                `;
            } else if (field.type === 'question') {
                sectionHtml += `<label class="block text-lg font-medium text-gray-800">${field.questionText}</label>`;
                if(field.explanationText) sectionHtml += `<p class="text-sm text-gray-500 mb-2">${field.explanationText}</p>`;

                switch (field.inputType) {
                    case 'textarea':
                        sectionHtml += `<textarea name="${fieldName}" class="${commonInputClass}" rows="4" required></textarea>`;
                        break;
                    case 'email':
                        sectionHtml += `<input type="email" name="${fieldName}" class="${commonInputClass}" required>`;
                        break;
                    case 'tel':
                        sectionHtml += `<input type="text" name="${fieldName}" class="${commonInputClass}" data-mask="tel" maxlength="15" required>`;
                        break;
                    case 'cpf_cnpj':
                        sectionHtml += `<input type="text" name="${fieldName}" class="${commonInputClass}" data-mask="cpf_cnpj" maxlength="18" required>`;
                        break;
                    case 'radio':
                        sectionHtml += '<div class="mt-2 space-y-2">';
                        (field.options || []).forEach((opt, index) => {
                            sectionHtml += `
                                <div class="flex items-center">
                                    <input type="radio" id="${fieldName}-${index}" name="${fieldName}" value="${opt}" class="h-4 w-4 text-indigo-600 border-gray-300" required>
                                    <label for="${fieldName}-${index}" class="ml-3 block text-sm font-medium text-gray-700">${opt}</label>
                                </div>`;
                        });
                        sectionHtml += '</div>';
                        break;
                    case 'checkbox':
                        sectionHtml += '<div class="mt-2 space-y-2">';
                        (field.options || []).forEach((opt, index) => {
                            sectionHtml += `
                                <div class="flex items-center">
                                    <input type="checkbox" id="${fieldName}-${index}" name="${fieldName}[]" value="${opt}" class="h-4 w-4 text-indigo-600 border-gray-300 rounded">
                                    <label for="${fieldName}-${index}" class="ml-3 block text-sm font-medium text-gray-700">${opt}</label>
                                </div>`;
                        });
                        sectionHtml += '</div>';
                        break;
                    default: // text
                        sectionHtml += `<input type="text" name="${fieldName}" class="${commonInputClass}" required>`;
                }
            }
            sectionHtml += `</div>`;
        });
        sectionsContainer.innerHTML = sectionHtml;
        addInputListeners();
        updateNavigation();
    };

    const updateNavigation = () => {
        backBtn.style.display = currentSectionIndex === 0 ? 'none' : 'inline-block';
        if (currentSectionIndex === formDefinition.sections.length - 1) {
            nextBtn.textContent = 'Finalizar e Assinar';
        } else {
            nextBtn.textContent = 'Continuar';
        }
    };

    const handleFormSubmit = async () => {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        const formData = new FormData(publicForm);
        const answers = {};
        for (const [key, value] of formData.entries()) {
            if (key.endsWith('[]')) {
                const cleanKey = key.slice(0, -2);
                if (!answers[cleanKey]) {
                    answers[cleanKey] = [];
                }
                if (Array.isArray(answers[cleanKey])) {
                    answers[cleanKey].push(value);
                }
            } else {
                answers[key] = value;
            }
        }
        for(const key in answers) {
            if(Array.isArray(answers[key])) {
                answers[key] = answers[key].join(', ');
            }
        }

        try {
            await updateDoc(formInstanceRef, {
                formData: answers,
                status: 'Preenchido',
                submittedAt: serverTimestamp()
            });
            window.location.href = `sign-contract.html?instanceId=${instanceId}`;
        } catch (error) {
            console.error("Erro ao enviar respostas: ", error);
            showNotification('Ocorreu um erro ao enviar suas respostas. Tente novamente.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Assinar e Enviar';
        }
    };

    try {
        formInstanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'formInstances', instanceId);
        const instanceDoc = await getDoc(formInstanceRef);

        if (!instanceDoc.exists()) throw new Error("Instância de formulário não encontrada.");

        const instanceData = instanceDoc.data();
        const status = instanceData.status;
        const hasPayment = instanceData.paymentLink && instanceData.paymentLink.trim() !== '';

        if (status === 'Preenchido') {
            formTitle.textContent = 'Este formulário já foi respondido.';
            publicForm.style.display = 'none';
            
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'text-center mt-6';
            
            const signButton = document.createElement('a');
            signButton.href = `sign-contract.html?instanceId=${instanceId}`;
            signButton.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 inline-block';
            signButton.textContent = 'Continuar para Assinatura';
            
            buttonContainer.appendChild(signButton);
            formTitle.insertAdjacentElement('afterend', buttonContainer);
            
            return;
        } else if (status === 'Assinado') {
            formTitle.textContent = 'Pagamento Pendente';
            publicForm.style.display = 'none';

            const message = document.createElement('p');
            message.className = 'text-center text-gray-600 mb-6';
            message.textContent = 'Este formulário já foi assinado. Para concluir o processo, por favor, realize o pagamento.';
            formTitle.insertAdjacentElement('afterend', message);

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'text-center mt-6';
            
            const paymentButton = document.createElement('a');
            paymentButton.href = `sign-contract.html?instanceId=${instanceId}`;
            paymentButton.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 inline-block';
            paymentButton.textContent = 'Ir para a Página de Pagamento';
            
            buttonContainer.appendChild(paymentButton);
            message.insertAdjacentElement('afterend', buttonContainer);

            return;
        } else if (status === 'Concluído') {
            formTitle.textContent = 'Este formulário já foi concluído.';
            publicForm.style.display = 'none';
            return;
        } else if (status !== 'Pendente') {
            // Fallback para outros status inesperados
            formTitle.textContent = 'Este formulário não está mais disponível.';
            publicForm.style.display = 'none';
            return;
        }

        const formTemplateRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', instanceData.formTemplateId);
        const formDoc = await getDoc(formTemplateRef);

        if (!formDoc.exists()) throw new Error("O modelo de formulário associado não foi encontrado.");

        formDefinition = formDoc.data();
        formTitle.textContent = formDefinition.name;

        renderCurrentSection();

    } catch (error) {
        console.error("Erro ao carregar o formulário:", error);
        formTitle.textContent = `Erro ao carregar: ${error.message}`;
        publicForm.style.display = 'none';
    }

    backBtn.addEventListener('click', () => {
        if (currentSectionIndex > 0) {
            currentSectionIndex--;
            renderCurrentSection();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (validateSection()) {
            if (currentSectionIndex < formDefinition.sections.length - 1) {
                currentSectionIndex++;
                renderCurrentSection();
            } else {
                handleFormSubmit();
            }
        } else {
            // Optionally, provide a general error message
        }
    });

    publicForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (validateSection()) {
            handleFormSubmit();
        }
    });
});
