// ==========================================================================
// 飘流幻境新世界 - 炼金合成模拟器交互逻辑 (simulator.js)
// ==========================================================================

let slots = [null, null, null, null, null];
let currentBook = 0;
let activeSlotIndex = -1;
let selectedModalItem = null;
let historyRecords = [];
let dbItems = [];

// DOM elements
document.addEventListener("DOMContentLoaded", () => {
    initSimulator();
});

function initSimulator() {
    if (window.alchemy_db) {
        dbItems = window.alchemy_db;
        console.log(`Simulator DB Loaded: ${dbItems.length} items.`);
        populateModalFilters();
    } else {
        showConsoleLog("系统错误: 无法载入物品数据库！", "fail");
    }

    // Load local history
    loadHistoryFromStorage();
    
    // Bind Tab click events or continuous cb change
    document.getElementById("continuous-synthesis-cb").addEventListener("change", (e) => {
        const statsPanel = document.getElementById("panel-continuous");
        if (e.target.checked) {
            statsPanel.classList.remove("hidden");
        } else {
            statsPanel.classList.add("hidden");
        }
    });

    // Modal filters autocomplete search listener
    document.getElementById("modal-search-input").addEventListener("input", () => {
        filterModalItems();
    });
}

// Populate search filter dropdowns in modal
function populateModalFilters() {
    const categorySelect = document.getElementById("modal-category-select");
    const materialSelect = document.getElementById("modal-material-select");
    
    const categories = new Set();
    const materials = new Set();
    
    dbItems.forEach(item => {
        if (item.category) categories.add(item.category);
        if (item.material) materials.add(item.material);
    });

    // Populate Category select
    Array.from(categories).sort((a,b) => a.localeCompare(b, "zh-Hans-CN")).forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
    });

    // Populate Material select
    ALL_EQUIPMENT_MATERIALS.forEach(mat => {
        const opt = document.createElement("option");
        opt.value = mat;
        opt.textContent = mat;
        materialSelect.appendChild(opt);
    });
}

// Right Panel Tab switching
function toggleRightTab(tabId) {
    const predictionTab = document.getElementById("panel-prediction");
    const consoleTab = document.getElementById("panel-console");
    const buttons = document.querySelectorAll(".quick-panel-card .panel-tab-btn:not(#tab-btn-history):not(#tab-btn-settings)");

    buttons.forEach(btn => btn.classList.remove("active"));
    
    if (tabId === 'prediction') {
        predictionTab.classList.remove("hidden");
        consoleTab.classList.add("hidden");
        event.currentTarget.classList.add("active");
    } else if (tabId === 'console') {
        predictionTab.classList.add("hidden");
        consoleTab.classList.remove("hidden");
        event.currentTarget.classList.add("active");
    }
}

// Drawers Opening and Closing
function toggleRightDrawer(drawerId) {
    const drawer = document.getElementById(`drawer-${drawerId}`);
    const overlay = document.getElementById(`drawer-${drawerId}-overlay`);
    
    if (drawer.classList.contains("active")) {
        drawer.classList.remove("active");
        overlay.classList.remove("active");
    } else {
        drawer.classList.add("active");
        overlay.classList.add("active");
        if (drawerId === "history") {
            renderHistoryRecords();
        }
    }
}

function closeRightDrawer(drawerId) {
    document.getElementById(`drawer-${drawerId}`).classList.remove("active");
    document.getElementById(`drawer-${drawerId}-overlay`).classList.remove("active");
}

// Book selection change
function onBookChange() {
    currentBook = parseInt(document.getElementById("book-select").value);
    showConsoleLog(`参数设定: 当前百科等级更改为百科 ${currentBook} (+${currentBook}级)`, "system");
    recalculateSimulator();
}

// Recalculate synthesis predictions
function recalculateSimulator() {
    const ingredients = slots.filter(Boolean);
    const btnSynth = document.getElementById("btn-synthesize-action");
    const emptyState = document.getElementById("prediction-empty");
    const tableEl = document.getElementById("prediction-table");
    const tbody = document.getElementById("prediction-tbody");
    
    const baseLvlEl = document.getElementById("predict-base-level");
    const rangeEl = document.getElementById("predict-level-range");
    const matsEl = document.getElementById("predict-materials");
    
    const targetSelect = document.getElementById("continuous-target-select");
    
    // Clear targets
    targetSelect.innerHTML = '<option value="">随机合成 (不指定)</option>';

    if (ingredients.length < 2) {
        // Disabled State
        btnSynth.classList.add("disabled");
        emptyState.classList.remove("hidden");
        tableEl.classList.add("hidden");
        
        baseLvlEl.textContent = "--";
        rangeEl.textContent = "--";
        matsEl.textContent = "--";
        return;
    }

    // Enabled State
    btnSynth.classList.remove("disabled");
    
    // Calculate L_min
    const levels = ingredients.map(item => item.level);
    const L_min = Math.min(...levels);
    
    // Calculate Range
    const range = getAdvancedAlchemyLevelRange(ingredients[0].level, L_min, currentBook);
    
    // Collect materials
    const materials = Array.from(new Set(ingredients.map(item => item.material).filter(Boolean)));
    
    // Update labels
    baseLvlEl.textContent = `${L_min} 级`;
    rangeEl.textContent = `${range.min} 级 ~ ${range.max} 级`;
    matsEl.textContent = materials.join(" / ");

    // Fetch candidate outcomes
    const outcomes = getRecipeOutcomeBreakdownMulti(ingredients, currentBook);
    
    tbody.innerHTML = "";
    if (outcomes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="history-empty">符合材质与等级区间的装备候选为空。合成结果可能是垃圾木屑。</td></tr>`;
        tableEl.classList.remove("hidden");
        emptyState.classList.add("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    tableEl.classList.remove("hidden");

    outcomes.forEach(o => {
        // Render Row
        const tr = document.createElement("tr");
        
        let successClass = "success-high";
        if (o.rate < 15) successClass = "success-verylow";
        else if (o.rate < 30) successClass = "success-low";
        else if (o.rate < 60) successClass = "success-medium";
        
        tr.innerHTML = `
            <td><span class="pred-level-badge">${o.level}</span></td>
            <td><span class="pred-name">${o.name}</span></td>
            <td>${o.material} / ${o.category}</td>
            <td><span class="pred-stats">${o.stats}</span></td>
            <td><span class="pred-rate-cell ${successClass}">${o.rate}%</span></td>
        `;
        tbody.appendChild(tr);

        // Add to continuous target select
        const opt = document.createElement("option");
        opt.value = o.name;
        opt.textContent = `${o.name} [物等 ${o.level}] (${o.rate}%)`;
        targetSelect.appendChild(opt);
    });
}

// Modal: Open Material Selector Modal
function openItemSelector(slotIdx) {
    activeSlotIndex = slotIdx;
    selectedModalItem = null;
    document.getElementById("item-selector-modal").classList.remove("hidden");
    
    // Reset filters
    document.getElementById("modal-search-input").value = "";
    document.getElementById("modal-category-select").value = "";
    document.getElementById("modal-material-select").value = "";
    document.getElementById("modal-clear-search-btn").style.display = "none";
    
    // Render current selected summary
    renderModalSelectedSummary(slots[slotIdx]);
    
    // Populate items table list
    filterModalItems();
}

function closeItemSelector() {
    document.getElementById("item-selector-modal").classList.add("hidden");
    activeSlotIndex = -1;
}

function clearModalSearch() {
    document.getElementById("modal-search-input").value = "";
    document.getElementById("modal-clear-search-btn").style.display = "none";
    filterModalItems();
}

// Filter items in modal list
function filterModalItems() {
    const query = document.getElementById("modal-search-input").value.trim().toLowerCase();
    const clearBtn = document.getElementById("modal-clear-search-btn");
    if (query.length > 0) {
        clearBtn.style.display = "block";
    } else {
        clearBtn.style.display = "none";
    }

    const category = document.getElementById("modal-category-select").value;
    const material = document.getElementById("modal-material-select").value;

    // Parse "level+material" combo format (e.g. "21木", "木21", "21 木材")
    let parsedLevel = null;
    let parsedMaterial = null;
    let remainingQuery = query;

    const COMBO_PATTERNS = [
        { regex: /^(\d+)\s+(\S+)$/, numIdx: 1, matIdx: 2 },
        { regex: /^(\S+)\s+(\d+)$/, numIdx: 2, matIdx: 1 },
        { regex: /^(\d+)(\S+)$/,    numIdx: 1, matIdx: 2 },
        { regex: /^(\S+)(\d+)$/,    numIdx: 2, matIdx: 1 },
    ];

    for (const p of COMBO_PATTERNS) {
        const m = query.match(p.regex);
        if (m) {
            const resolved = resolveMaterialAbbreviation(m[p.matIdx]);
            if (resolved) {
                parsedLevel = parseInt(m[p.numIdx], 10);
                parsedMaterial = resolved;
                remainingQuery = '';
            }
            break;
        }
    }

    // Filter database
    const matches = dbItems.filter(item => {
        // Must have level and material
        if (!item.material || item.level <= 0) return false;

        // Exact level+material filter from parsed combo
        if (parsedLevel !== null && item.level !== parsedLevel) return false;
        if (parsedMaterial && item.material !== parsedMaterial) return false;

        if (remainingQuery) {
            const searchable = [
                ...getItemSearchAliases(item),
                item.id,
                item.level
            ].map(v => String(v || "").toLowerCase());
            if (!searchable.some(v => v.includes(remainingQuery))) return false;
        }
        if (category && item.category !== category) return false;
        if (material && item.material !== material) return false;
        
        return true;
    });

    // Sort: level descending
    matches.sort((a,b) => b.level - a.level || a.name.localeCompare(b.name, "zh-Hans-CN"));

    // Render table
    const tbody = document.getElementById("modal-items-tbody");
    tbody.innerHTML = "";
    
    if (matches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="history-empty">没有找到符合条件的材料物品</td></tr>`;
        return;
    }

    matches.slice(0, 150).forEach(item => {
        const tr = document.createElement("tr");
        if (selectedModalItem && selectedModalItem.id === item.id) {
            tr.className = "selected";
        }
        
        tr.innerHTML = `
            <td><span class="pred-level-badge">${item.level}</span></td>
            <td><strong>${item.name}</strong></td>
            <td>${item.material || '无'}</td>
            <td>${item.category || item.type || '无'}</td>
            <td><span class="pred-stats">${item.stats || '无'}</span></td>
        `;
        
        tr.addEventListener("click", () => {
            // Remove previous select
            const selectedRows = tbody.querySelectorAll("tr.selected");
            selectedRows.forEach(row => row.classList.remove("selected"));
            tr.classList.add("selected");
            
            selectedModalItem = item;
            renderModalSelectedSummary(item);
        });

        tbody.appendChild(tr);
    });

    if (matches.length > 150) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="history-empty" style="color: var(--gold)">结果过多，仅显示前 150 项，请输入更精确的搜索关键字。</td>`;
        tbody.appendChild(tr);
    }
}

// Render selected summary bar inside selector modal
function renderModalSelectedSummary(item) {
    const summaryBox = document.getElementById("modal-selected-summary");
    
    if (!item) {
        summaryBox.innerHTML = `
            <div class="selected-item-info">
                <span class="selected-details-empty">当前未放置任何物品。请在下方列表选择以放置。</span>
                <button type="button" class="btn-confirm-selection" style="background:#bf616a; color:#fff" onclick="confirmSlotClear()">清空此插槽</button>
            </div>
        `;
        return;
    }

    summaryBox.innerHTML = `
        <div class="selected-item-info">
            <div class="selected-item-left">
                <span class="pred-level-badge">${item.level}级</span>
                <strong>${item.name}</strong>
                <span style="font-size:0.75rem; color:var(--text-muted)">(${item.material} / ${item.category})</span>
            </div>
            <div style="display:flex; gap: 8px;">
                <button type="button" class="btn-confirm-selection" style="background:#bf616a; color:#fff; border-color:transparent" onclick="confirmSlotClear()">清空</button>
                <button type="button" class="btn-confirm-selection" onclick="confirmItemSelection()">确认放置</button>
            </div>
        </div>
    `;
}

// Confirm item selection for active slot
function confirmItemSelection() {
    if (!selectedModalItem) return;
    
    slots[activeSlotIndex] = selectedModalItem;
    updateSlotUI(activeSlotIndex, selectedModalItem);
    closeItemSelector();
    
    showConsoleLog(`插槽更新: 槽 ${activeSlotIndex + 1} 放置了 [${selectedModalItem.name}] (物等 ${selectedModalItem.level}, 材质 ${selectedModalItem.material})`, "action");
    recalculateSimulator();
}

// Clear single slot
function confirmSlotClear() {
    slots[activeSlotIndex] = null;
    updateSlotUI(activeSlotIndex, null);
    closeItemSelector();
    
    showConsoleLog(`插槽更新: 槽 ${activeSlotIndex + 1} 已清空`, "action");
    recalculateSimulator();
}

// Update slot button UI appearance
function updateSlotUI(slotIdx, item) {
    const slotBtn = document.getElementById(`slot-${slotIdx + 1}`);
    const inner = slotBtn.querySelector(".slot-inner");
    
    if (item) {
        slotBtn.classList.remove("empty");
        slotBtn.classList.add("filled");
        inner.innerHTML = `
            <span class="slot-item-level">${item.level}</span>
            <span class="slot-item-name" title="${item.name}">${item.name}</span>
            <span class="slot-label">槽 ${slotIdx + 1}: ${item.name}</span>
        `;
    } else {
        slotBtn.classList.remove("filled");
        slotBtn.classList.add("empty");
        inner.innerHTML = `
            <span class="slot-label">${slotIdx === 0 ? '主材' : '副材'} (Slot ${slotIdx + 1})</span>
            <span class="slot-symbol">?</span>
        `;
    }
}

// Clear all 5 slots
function clearAllSlots() {
    slots = [null, null, null, null, null];
    for (let i = 0; i < 5; i++) {
        updateSlotUI(i, null);
    }
    showConsoleLog("插槽操作: 所有放置的插槽已被清空。", "action");
    recalculateSimulator();
}

// Pick random result according to probability distribution
function pickRandomResult(outcomes) {
    if (!outcomes || outcomes.length === 0) return null;
    const totalRate = outcomes.reduce((sum, o) => sum + o.rate, 0);
    const r = Math.random() * totalRate;
    let acc = 0;
    for (const outcome of outcomes) {
        acc += outcome.rate;
        if (r <= acc) {
            return outcome.item;
        }
    }
    return outcomes[outcomes.length - 1].item;
}

// Trigger Single Synthesis Action
function handleSynthesizeClick() {
    const ingredients = slots.filter(Boolean);
    if (ingredients.length < 2) return;

    const arena = document.querySelector(".alchemy-arena");
    const btn = document.getElementById("btn-synthesize-action");
    
    // Prevent double clicking during animation
    if (arena.classList.contains("animating")) return;
    
    arena.classList.add("animating");
    btn.classList.add("disabled");
    showConsoleLog("系统操作: 开始融合反应！炼金法阵与熔釜已激活...", "system");
    
    // Fetch outcome
    const outcomes = getRecipeOutcomeBreakdownMulti(ingredients, currentBook);
    const resultItem = pickRandomResult(outcomes);

    setTimeout(() => {
        arena.classList.remove("animating");
        btn.classList.remove("disabled");
        
        if (!resultItem) {
            showConsoleLog("融合失败: 合成由于能量偏离而崩解，仅产出垃圾残余。", "fail");
            alert("合成失败！放入的材料被损毁。");
            return;
        }

        // Show Reveal Modal
        revealResult(resultItem, outcomes);
        
        // Log to console
        const rate = outcomes.find(o => o.name === resultItem.name)?.rate || 0;
        showConsoleLog(`成功融出: 【${resultItem.name}】! (物等 ${resultItem.level}, 属性 ${resultItem.material}, 预测概率 ${rate}%)`, "success");
        
        // Save to history records
        saveHistoryRecord(ingredients, resultItem);
    }, 1500); // 1.5 seconds animation
}

// Reveal result modal
function revealResult(item, outcomes) {
    document.getElementById("reveal-item-level").textContent = `物等 ${item.level}`;
    document.getElementById("reveal-item-name").textContent = item.name;
    document.getElementById("reveal-item-material").textContent = item.material || "无";
    document.getElementById("reveal-item-category").textContent = item.category || item.type || "无";
    document.getElementById("reveal-item-stats").textContent = item.stats || "无属性";
    
    document.getElementById("result-reveal-modal").classList.remove("hidden");
}

function closeResultReveal() {
    document.getElementById("result-reveal-modal").classList.add("hidden");
}

// Run Continuous Batch Simulation
function runContinuousSimulation() {
    const ingredients = slots.filter(Boolean);
    if (ingredients.length < 2) {
        alert("材料不足！请在左侧法阵中放入至少两个物品。");
        return;
    }

    const countSelect = document.getElementById("continuous-count-select");
    const targetSelect = document.getElementById("continuous-target-select");
    const runCount = parseInt(countSelect.value);
    const targetName = targetSelect.value;

    const outcomes = getRecipeOutcomeBreakdownMulti(ingredients, currentBook);
    if (outcomes.length === 0) {
        alert("无法计算出任何合法候选，不能进行批量模拟。");
        return;
    }

    showConsoleLog(`批量模拟: 启动批量仿真，共执行 ${runCount} 次连续融合反应...`, "system");
    
    // Set UI visible
    const statsGrid = document.getElementById("continuous-stats-results");
    statsGrid.classList.remove("hidden");

    let totalRuns = 0;
    let targetHits = 0;
    let totalGoldCost = 0;

    // Run loop
    for (let i = 0; i < runCount; i++) {
        const resultItem = pickRandomResult(outcomes);
        totalRuns++;
        totalGoldCost += BOOK_COSTS[currentBook];

        if (targetName && resultItem && resultItem.name === targetName) {
            targetHits++;
        }
    }

    // Render Stats
    document.getElementById("stat-total-runs").textContent = totalRuns;
    document.getElementById("stat-target-hits").textContent = targetName ? targetHits : "--";
    document.getElementById("stat-hit-rate").textContent = targetName ? `${((targetHits / totalRuns) * 100).toFixed(2)}%` : "--";
    document.getElementById("stat-gold-cost").textContent = totalGoldCost > 0 ? `${totalGoldCost} 金币` : "0 (不费百科)";

    if (targetName) {
        showConsoleLog(`批量统计完毕: 在 ${totalRuns} 次模拟合成中，设定目标产物【${targetName}】共出现了 ${targetHits} 次，实际命中概率约为 ${((targetHits / totalRuns) * 100).toFixed(2)}%。累计百科耗费: ${totalGoldCost}金币。`, "success");
    } else {
        showConsoleLog(`批量统计完毕: 随机模拟执行 ${totalRuns} 次完成。累计百科耗费: ${totalGoldCost}金币。`, "success");
    }
}

// Local history storage
function saveHistoryRecord(ingredients, result) {
    const timestamp = new Date().toLocaleTimeString();
    const itemStrings = ingredients.map(ing => `${ing.name}(等${ing.level})`);
    
    const record = {
        ingredients: itemStrings.join(" + "),
        book: currentBook,
        resultName: result.name,
        resultLevel: result.level,
        time: timestamp
    };

    historyRecords.unshift(record);
    if (historyRecords.length > 100) {
        historyRecords = historyRecords.slice(0, 100);
    }

    localStorage.setItem("alchemy_sim_history", JSON.stringify(historyRecords));
}

function loadHistoryFromStorage() {
    const saved = localStorage.getItem("alchemy_sim_history");
    if (saved) {
        try {
            historyRecords = JSON.parse(saved);
        } catch(e) {
            console.error("Error loading history", e);
            historyRecords = [];
        }
    }
}

function renderHistoryRecords() {
    const container = document.getElementById("history-records-list");
    container.innerHTML = "";
    
    if (historyRecords.length === 0) {
        container.innerHTML = `<div class="history-empty">暂无合成历史记录。</div>`;
        return;
    }

    historyRecords.forEach(rec => {
        const div = document.createElement("div");
        div.className = "history-item";
        
        const bookText = rec.book > 0 ? ` (百科${rec.book})` : " (无百科)";
        
        div.innerHTML = `
            <div class="history-item-header">
                <span>时间: ${rec.time}</span>
                <span>${bookText}</span>
            </div>
            <div class="history-item-materials">
                <strong>原料:</strong> ${rec.ingredients}
            </div>
            <div class="history-item-result">
                <span class="history-result-name">🏆 ${rec.resultName}</span>
                <span class="history-result-level">物等 ${rec.resultLevel}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

function clearHistoryRecords() {
    if (confirm("确定要清空本地所有 100 条炼金合成记录吗？")) {
        historyRecords = [];
        localStorage.removeItem("alchemy_sim_history");
        renderHistoryRecords();
        showConsoleLog("历史操作: 所有本地合成记录已清除。", "action");
    }
}

// Console helper
function showConsoleLog(message, type = "system") {
    const logBox = document.getElementById("console-logs");
    if (!logBox) return;

    const time = new Date().toLocaleTimeString();
    const prefix = type === "success" ? "【成功】" : type === "fail" ? "【失败】" : type === "action" ? "【动作】" : "【系统】";
    
    const div = document.createElement("div");
    div.className = `log-line ${type}`;
    div.innerHTML = `<span class="timestamp">[${time}]</span> ${prefix} ${message}`;
    
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}

function clearConsole() {
    const logBox = document.getElementById("console-logs");
    if (logBox) {
        logBox.innerHTML = `<div class="log-line system">[系统] 控制台日志已清空。</div>`;
    }
}

/**
 * Handle "返回配方寻路器" navigation.
 * On local file:// protocol, redirect to the archived stable version.
 * On server, use the relative path that points to the deployed root.
 */
function handleBackToFinder(event) {
    event.preventDefault();
    const isLocal = window.location.protocol === "file:";
    window.location.href = isLocal ? "../炼金项目归档/web/index.html" : "../index.html";
}
