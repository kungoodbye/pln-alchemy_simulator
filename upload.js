// ==========================================================================
// 飘流幻境新世界 - 炼金收集上传交互控制 (upload.js)
// ==========================================================================

const API_BASE = ""; // Relative paths since frontend is served by Go backend
let selectedFile = null;

document.addEventListener("DOMContentLoaded", () => {
    initUploadPage();
    loadUploadedRecords();
});

function initUploadPage() {
    const dropzone = document.getElementById("dropzone");
    
    // Drag and drop handlers
    ["dragenter", "dragover"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        }, false);
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
        }, false);
    });

    dropzone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }, false);

    // Clipboard paste handler
    document.addEventListener("paste", (e) => {
        const items = (e.clipboardData || window.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const blob = items[i].getAsFile();
                // Construct file object from pasted blob
                const file = new File([blob], `clipboard_${Date.now()}.png`, { type: blob.type });
                handleFile(file);
                break;
            }
        }
    });
}

// File select handler
function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
}

function handleFile(file) {
    if (!file.type.startsWith("image/")) {
        alert("请选择有效的图片文件！");
        return;
    }
    
    selectedFile = file;
    
    // UI Preview
    const preview = document.getElementById("upload-preview");
    const icon = document.getElementById("dropzone-icon");
    const text = document.getElementById("dropzone-text");
    
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = "block";
        icon.style.display = "none";
        text.style.display = "none";
    };
    reader.readAsDataURL(file);
}

// Perform server-side upload and record submission
async function startUploadAndRecord() {
    if (!selectedFile) {
        alert("请先选择、拖入或粘贴要上传的合成截图！");
        return;
    }

    const progressBox = document.getElementById("upload-progress-box");
    const btnSubmit = document.getElementById("btn-submit-upload");

    btnSubmit.classList.add("disabled");
    progressBox.style.display = "block";

    try {
        // Send file to Go backend in a multipart form
        const formData = new FormData();
        formData.append("file", selectedFile);

        const res = await fetch(`${API_BASE}/api/upload`, {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || res.statusText);
        }

        alert("合成截图直传并收录成功！感谢您的贡献。");
        resetUploadForm();
        loadUploadedRecords();

    } catch (err) {
        alert(`上传出错: ${err.message}`);
        console.error(err);
    } finally {
        btnSubmit.classList.remove("disabled");
    }
}

// Reset form elements
function resetUploadForm() {
    selectedFile = null;

    document.getElementById("file-input").value = "";
    document.getElementById("upload-preview").style.display = "none";
    document.getElementById("dropzone-icon").style.display = "block";
    document.getElementById("dropzone-text").style.display = "block";
    document.getElementById("upload-progress-box").style.display = "none";
}

// Fetch uploaded records list from Go Server
async function loadUploadedRecords() {
    const emptyState = document.getElementById("records-empty");
    const container = document.getElementById("records-container");
    container.innerHTML = "";

    try {
        const res = await fetch(`${API_BASE}/api/upload/records`);
        if (!res.ok) throw new Error("获取数据列表失败");
        const data = await res.json();

        if (data.length === 0) {
            emptyState.style.display = "flex";
            return;
        }

        emptyState.style.display = "none";
        
        data.forEach(rec => {
            const card = document.createElement("div");
            card.className = "record-item-card";
            
            // Format timestamp nicely
            let displayTime = "未知时间";
            if (rec.timestamp) {
                try {
                    const d = new Date(rec.timestamp);
                    displayTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                } catch(e) {
                    displayTime = rec.timestamp;
                }
            }

            // Build recipes list display if recognized
            let recipesHtml = "";
            if (rec.status === "recognized" && rec.result && rec.result.recipes) {
                rec.result.recipes.forEach(recipe => {
                    recipesHtml += `
                        <div style="font-size: 0.8rem; margin-top: 5px; color: #eed8a1; line-height: 1.4;">
                            <span style="color: var(--gold)">主(${recipe.slot1_level})${recipe.slot1_name}</span> + 
                            <span style="color: #a3be8c">副(${recipe.slot2_level})${recipe.slot2_name}</span> 
                            ➡️ 
                            <span style="color: #ff9f43; font-weight: bold">(${recipe.target_level})${recipe.target_name}</span>
                        </div>
                    `;
                });
            } else {
                recipesHtml = `<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; margin-top: 5px;">⏳ 暂未识别，可使用脚本进行标注录入</div>`;
            }

            card.innerHTML = `
                <img class="record-thumb" src="${rec.image_url}" alt="截图" onclick="openImgModal('${rec.image_url}')">
                <div class="record-info">
                    <div class="record-formula">
                        <span class="item-hl" style="color: var(--gold)">合成记录截图 #${rec.id}</span>
                    </div>
                    <div class="record-recipes-list" style="margin-top: 5px;">
                        ${recipesHtml}
                    </div>
                    <div class="record-desc" style="margin-top: 10px; font-size: 0.72rem; color: var(--text-muted)">
                        上传时间: ${displayTime}
                    </div>
                </div>
                <div class="record-status-cell">
                    <span class="tag-model-status ${rec.status === 'recognized' ? 'tag-in-model' : 'tag-new-formula'}" style="margin-bottom: 8px;">
                        ${rec.status === 'recognized' ? '已录入' : '待处理'}
                    </span>
                    <span style="font-size: 0.7rem; color: var(--text-muted)">ID: ${rec.id}</span>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="history-empty" style="color:var(--danger)">无法连接到 Go 服务端 (请确保在 uploader_service 目录下启动了 go run main.go)</div>`;
    }
}

// Large image view modal helper
function openImgModal(url) {
    const modal = document.getElementById("img-modal");
    const modalImg = document.getElementById("modal-large-img");
    modalImg.src = url;
    modal.classList.remove("hidden");
}

function closeImgModal() {
    document.getElementById("img-modal").classList.add("hidden");
}
