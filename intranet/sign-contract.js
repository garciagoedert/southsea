import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './firebase-config.js';
import { showNotification } from './common-ui.js';

const { jsPDF } = window.jspdf;

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const contractTitle = document.getElementById('contract-title');
    const contractContent = document.getElementById('contract-content');
    const signerName = document.getElementById('signer-name');
    const signerDoc = document.getElementById('signer-doc');
    const fontSelect = document.getElementById('font-select');
    const signatureInput = document.getElementById('signature-input');
    const termsCheckbox = document.getElementById('terms-checkbox');
    const signBtn = document.getElementById('sign-btn');
    const confirmationSection = document.querySelector('.confirmation-section');
    const postSignatureView = document.getElementById('post-signature-view');
    const signedContractPreview = document.getElementById('signed-contract-preview');
    const paymentLinkBtn = document.getElementById('payment-link-btn');
    const downloadFinalPdfBtn = document.getElementById('download-final-pdf-btn');

    let instanceData = null;
    let formDefinition = null;

    const params = new URLSearchParams(window.location.search);
    const instanceId = params.get('instanceId');

    if (!instanceId) {
        contractContent.innerHTML = '<p class="text-red-500">Link de assinatura inválido ou ausente.</p>';
        return;
    }

    const escapeRegex = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const showFinalView = (signatureData, populatedContract) => {
        confirmationSection.classList.add('hidden');
        postSignatureView.classList.remove('hidden');

        const printableContent = document.createElement('div');
        printableContent.innerHTML = populatedContract;

        const signatureDate = signatureData.signedDate?.toDate ? signatureData.signedDate.toDate() : new Date(signatureData.signedDate);
        const signatureDateString = signatureDate.toLocaleDateString('pt-BR');
        
        const signaturesContainer = document.createElement('div');
        signaturesContainer.className = 'mt-16 pt-8';
        signaturesContainer.innerHTML = `
            <div style="display: flex; justify-content: space-around; align-items: flex-start;">
                <div style="width: 45%; text-align: center;">
                    <p class="${signatureData.font}" style="font-size: 2.5rem; margin-bottom: 0.5rem;">${signatureData.signature}</p>
                    <hr style="border-top: 1px solid black; margin: 0 auto; width: 80%;">
                    <p style="margin-top: 0.5rem;">${signatureData.name}</p>
                    <p style="font-size: 0.875rem;">${signatureData.document}</p>
                    <p style="font-size: 0.875rem;">Assinado em: ${signatureDateString}</p>
                </div>
                <div style="width: 45%; text-align: center;">
                    <p class="font-tangerine" style="font-size: 2rem; margin-bottom: 0.5rem;">Alefy Mikael dos Santos</p>
                    <hr style="border-top: 1px solid black; margin: 0 auto; width: 80%;">
                    <p style="margin-top: 0.5rem;">Alefy Mikael dos Santos</p>
                    <p style="font-size: 0.875rem;">52.783.717/0001-50</p>
                    <p style="font-size: 0.875rem;">Assinado em: ${signatureDateString}</p>
                </div>
            </div>
        `;
        printableContent.appendChild(signaturesContainer);
        
        signedContractPreview.innerHTML = '';
        signedContractPreview.appendChild(printableContent);

        const hasPayment = instanceData && instanceData.paymentLink && instanceData.paymentLink.trim() !== '';
        if (hasPayment) {
            paymentLinkBtn.href = instanceData.paymentLink;
        } else {
            paymentLinkBtn.style.display = 'none';
            const title = postSignatureView.querySelector('h2');
            const paragraph = postSignatureView.querySelector('p');
            if (title) title.textContent = 'Processo Concluído!';
            if (paragraph) paragraph.textContent = 'Obrigado! O contrato foi assinado e o processo está finalizado. Você pode baixar uma cópia do documento abaixo.';
        }
    };

    try {
        const formInstanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'formInstances', instanceId);
        const instanceDoc = await getDoc(formInstanceRef);

        if (!instanceDoc.exists()) throw new Error("Instância de formulário não encontrada.");
        
        instanceData = instanceDoc.data();
        
        const formTemplateRef = doc(db, 'artifacts', appId, 'public', 'data', 'forms', instanceData.formTemplateId);
        const formDoc = await getDoc(formTemplateRef);

        if (!formDoc.exists()) throw new Error("O modelo de formulário associado não foi encontrado.");

        formDefinition = formDoc.data();
        contractTitle.textContent = formDefinition.name;

        let populatedContract = formDefinition.contractTemplate || '<p>Template de contrato não definido.</p>';
        const formData = instanceData.formData || {};
        
        formDefinition.sections.flatMap(s => s.fields).forEach(field => {
            if (!field.tag) return;

            const cleanTag = field.tag.trim();
            const baseName = cleanTag.replace(/##/g, '');

            if (field.type === 'question') {
                const value = formData[baseName] || '';
                const regex = new RegExp(escapeRegex(cleanTag), 'g');
                populatedContract = populatedContract.replace(regex, value);
            } else if (field.type === 'address') {
                const addressParts = ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'estado'];
                addressParts.forEach(part => {
                    const partKey = `${baseName}-${part}`;
                    const partTag = `##${partKey}##`;
                    const value = formData[partKey] || '';
                    const regex = new RegExp(escapeRegex(partTag), 'g');
                    populatedContract = populatedContract.replace(regex, value);
                });
            }
        });

        contractContent.innerHTML = populatedContract;

        if (instanceData.status === 'Assinado' || instanceData.status === 'Concluído') {
            if (instanceData.signatureData) {
                showFinalView(instanceData.signatureData, populatedContract);
            } else {
                // Handle case where status is signed but no signature data is present
                confirmationSection.innerHTML = '<p class="text-center text-red-500">Erro: O contrato está marcado como assinado, mas os dados da assinatura não foram encontrados.</p>';
            }
            return; // Stop further execution
        }

    } catch (error) {
        console.error("Erro ao carregar o contrato:", error);
        contractContent.innerHTML = `<p class="text-red-500">Erro ao carregar o contrato: ${error.message}</p>`;
    }

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

    const validateForm = () => {
        const docValue = signerDoc.value.trim();
        const isDocValid = validateCPF(docValue) || validateCNPJ(docValue);
        
        if (docValue.length > 0) {
            signerDoc.style.borderColor = isDocValid ? 'green' : 'red';
        } else {
            signerDoc.style.borderColor = '';
        }

        const isNameValid = signerName.value.trim() !== '';
        const isSignatureValid = signatureInput.value.trim() !== '';
        const isTermsChecked = termsCheckbox.checked;
        
        signBtn.disabled = !(isNameValid && isDocValid && isSignatureValid && isTermsChecked);
    };

    const generateAndDownloadPdf = async () => {
        downloadFinalPdfBtn.disabled = true;
        downloadFinalPdfBtn.textContent = 'Gerando PDF...';

        const pdfContainer = document.createElement('div');
        pdfContainer.style.position = 'absolute';
        pdfContainer.style.left = '-9999px';
        pdfContainer.style.width = '800px';
        pdfContainer.style.background = 'white';
        pdfContainer.style.padding = '40px';
        
        const headerImg = new Image();
        headerImg.src = '../newimag/Sss.png';
        
        const contentToPrint = signedContractPreview.cloneNode(true);
        contentToPrint.style.height = 'auto';
        contentToPrint.style.maxHeight = 'none';
        contentToPrint.style.overflowY = 'visible';
        
        const headerContainer = document.createElement('div');
        headerContainer.style.textAlign = 'center';
        headerContainer.style.marginBottom = '40px';
        
        // Set a fixed width for the header image in the container
        headerImg.style.width = '180px';
        headerImg.style.height = 'auto';
        
        headerContainer.appendChild(headerImg);
        
        pdfContainer.appendChild(headerContainer);
        pdfContainer.appendChild(contentToPrint);
        document.body.appendChild(pdfContainer);

        try {
            const canvas = await html2canvas(pdfContainer, {
                scale: 2,
                useCORS: true,
                scrollY: -window.scrollY,
                windowWidth: pdfContainer.scrollWidth,
                windowHeight: pdfContainer.scrollHeight
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);

            const watermarkImg = new Image();
            watermarkImg.src = '../newimag/capalogo SS.png';
            watermarkImg.onload = () => {
                const imgWidth = 500; // Further increased size
                const imgHeight = 500; // Further increased size
                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();
                const x = (pageWidth - imgWidth) / 2;
                const y = (pageHeight - imgHeight) / 2;
                pdf.setGState(new pdf.GState({opacity: 0.1}));
                pdf.addImage(watermarkImg, 'PNG', x, y, imgWidth, imgHeight);
                pdf.setGState(new pdf.GState({opacity: 1}));
                pdf.save(`${contractTitle.textContent.replace(/ /g, '_')}_assinado.pdf`);
            };
            watermarkImg.onerror = () => {
                 pdf.save(`${contractTitle.textContent.replace(/ /g, '_')}_assinado.pdf`);
            };

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            showNotification("Ocorreu um erro ao gerar o PDF. Tente novamente.", 'error');
        } finally {
            document.body.removeChild(pdfContainer);
            downloadFinalPdfBtn.disabled = false;
            downloadFinalPdfBtn.textContent = 'Baixar PDF do Contrato';
        }
    };

    fontSelect.addEventListener('change', (e) => {
        signatureInput.className = signatureInput.className.replace(/font-\S+/g, '');
        signatureInput.classList.add(e.target.value);
    });

    signerDoc.addEventListener('input', (e) => {
        e.target.value = maskCPFCNPJ(e.target.value);
        validateForm();
    });

    [signerName, signatureInput, termsCheckbox].forEach(el => {
        el.addEventListener('input', validateForm);
        el.addEventListener('change', validateForm);
    });

    signBtn.addEventListener('click', async () => {
        signBtn.disabled = true;
        signBtn.textContent = 'Processando...';

        const signatureDate = new Date();
        const signatureData = {
            name: signerName.value,
            document: signerDoc.value,
            signature: signatureInput.value,
            font: fontSelect.value,
            signedDate: signatureDate,
        };

        const hasPayment = instanceData && instanceData.paymentLink && instanceData.paymentLink.trim() !== '';
        const finalStatus = hasPayment ? 'Assinado' : 'Concluído';

        try {
            const formInstanceRef = doc(db, 'artifacts', appId, 'public', 'data', 'formInstances', instanceId);
            await updateDoc(formInstanceRef, {
                status: finalStatus,
                signedAt: serverTimestamp(),
                signatureData: signatureData
            });
            
            // Update local instance data for immediate UI update
            instanceData.status = finalStatus;
            instanceData.signatureData = signatureData;

            showFinalView(signatureData, contractContent.innerHTML);

        } catch (error) {
            console.error("Erro ao salvar assinatura:", error);
            showNotification("Ocorreu um erro ao salvar sua assinatura. Por favor, tente baixar o PDF e entre em contato conosco.", 'error');
            signBtn.disabled = false;
            signBtn.textContent = 'Assinar';
        }
    });

    downloadFinalPdfBtn.addEventListener('click', generateAndDownloadPdf);
});
