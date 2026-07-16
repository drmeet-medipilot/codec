
        // LOGIN LOGIC
        function processLogin() {
            const u = document.getElementById('login-user').value;
            const p = document.getElementById('login-pass').value;
            if (u === 'admin' && p === 'admin') {
                sessionStorage.setItem('isLoggedIn', 'true');
                document.getElementById('login-overlay').classList.add('hidden');
            } else {
                alert('Invalid Credentials');
            }
        }
        
        // LOGOUT LOGIC
        function processLogout() {
            sessionStorage.removeItem('isLoggedIn');
            window.location.reload(); 
        }
        
        // Check session on load
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            document.getElementById('login-overlay').classList.add('hidden');
        }

        /**
         * GLOBAL CONTROLLER ARCHITECTURE: ENCAPSULATED DATA STORAGE INTERFACE
         */
        class SystemStorage {
            static VAULT_KEY = "CARESUITE_ERP_INDIA_VAULT_ENGINE";

            static initializeEmptySchema() {
                const schema = {
                    patients: [],
                    visits: [],
                    inventory: [],
                    finance: [],
                    credits: [],
                    suppliers: [],
                    clinicProfile: { name: '', address: '', mobile: '', regno: '', doctor: '' },
                    metadata: { initializedAt: new Date().toISOString(), softwareVersion: "2026.7.4" }
                };
                
                // HIGH QUALITY INDIAN CLINICAL SEED DATA ARRAY
                schema.patients = [
                    { id: "PT-9101", name: "Aarav Sharma", mobile: "9876543210", ageVal: 6, ageUnit: "Years", weight: 21.5, address: "H-42, Sector 15, Rohini, New Delhi", allergies: "Dust/Pollen Hypersensitivity" },
                    { id: "PT-9102", name: "Priya Patel", mobile: "9123456789", ageVal: 27, ageUnit: "Years", weight: 62.0, address: "A-304, Shanti Nagar, Ahmedabad, Gujarat", allergies: "Sulfa Drugs Risk Matrix" },
                    { id: "PT-9103", name: "Baby of R. Verma", mobile: "9988776655", ageVal: 14, ageUnit: "Months", weight: 9.8, address: "Flat 12B, Royal Orchid, Andheri West, Mumbai", allergies: "None Recorded" }
                ];
                schema.inventory = [
                    { id: "MED-901", type: "Tablet", name: "Augmentin 625 Duo Tab", generic: "Amoxicillin + Clavulanate", supplier: "Balaji Pharma Distributors", expiry: "2027-05", unitQty: 10, qty: 200, purchase: 12.50, selling: 20.15 },
                    { id: "MED-902", type: "Tablet", name: "Calpol 650mg Tablet", generic: "Paracetamol", supplier: "Sunrise Meds", expiry: "2026-11", unitQty: 15, qty: 12, purchase: 1.10, selling: 2.30 }
                ];
                schema.visits = [
                    { id: "VST-1001", patientId: "PT-9101", date: new Date().toLocaleDateString('en-IN'), complaint: "Acute dry cough vector, mild evening pyrexia", diagnosis: "Upper Respiratory Tract Infection", vitals: { bp: "110/70", pulse: "88", spo2: "99", rbs: "" }, treatmentType: "None", treatmentPlan: "", prescription: "Calpol 650mg -- 1/2 tab whenever fever > 100F\nAugmentin 375mg -- 1 tab twice daily x 5 days" }
                ];
                schema.finance = [
                    { type: "INFLOW", category: "General Clinic Services / Billing", ref: "INV-1001", amount: 500, date: new Date().toLocaleDateString('en-IN') },
                    { type: "OUTFLOW", category: "Utility Grid (Power/Net)", ref: "Monthly Fiber Line", amount: 1200, date: new Date().toLocaleDateString('en-IN') }
                ];
                schema.suppliers = [
                    { name: "Balaji Pharma Distributors", contact: "Rajesh Kumar", phone: "9876543211" },
                    { name: "Sunrise Meds", contact: "Ahmedabad", phone: "9123456780" }
                ];

                localStorage.setItem(this.VAULT_KEY, JSON.stringify(schema));
                return schema;
            }

            static read() {
                try {
                    const raw = localStorage.getItem(this.VAULT_KEY);
                    if (!raw) return this.initializeEmptySchema();
                    const parsed = JSON.parse(raw);
                    if (!parsed.credits) parsed.credits = []; 
                    return parsed;
                } catch (e) {
                    console.error("Local storage cluster partition read failure", e);
                    return this.initializeEmptySchema();
                }
            }

            static write(payload) {
                try {
                    localStorage.setItem(this.VAULT_KEY, JSON.stringify(payload));
                    UI.triggerGlobalAuditRefresh();
                } catch (e) {
                    alert("Write transaction failure: Local memory capacity limits breached.");
                }
            }

            static exportDatabaseVault() {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.read(), null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `MediPilot_Vault_${new Date().toISOString().split('T')[0]}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
            }

            static importDatabaseVault() {
                const payloadField = document.getElementById("import-json-payload");
                try {
                    const parsed = JSON.parse(payloadField.value.trim());
                    if (!parsed.patients || !parsed.inventory) throw new Error("Data missing schema parameters");
                    localStorage.setItem(this.VAULT_KEY, JSON.stringify(parsed));
                    payloadField.value = "";
                    alert("Database context re-seeded successfully.");
                    UI.triggerGlobalAuditRefresh();
                    UI.routeToTab('dashboard');
                } catch (err) {
                    alert("Fatal Parse Failure: Payload structural integrity is corrupted.");
                }
            }
        }

        /**
         * INTERFACE AND VIEW STATE LOGIC CONTROLLER MATRIX
         */
        class UI {
            static activeCharts = {};
            static qrCodeInstance = null;
            static otcQrCodeInstance = null;
            static currentInventoryFilter = null;
            static pendingStockDeductions = [];
            static otcCart = []; 

            // Helper function to standardise date parsing for filtering
            static parseIndianDate(dateStr) {
                if(!dateStr) return new Date(0);
                const parts = dateStr.split(/[-/]/);
                if (parts.length === 3 && parts[2].length === 4) {
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
                return new Date(dateStr);
            }

            static handleTimeframeChange() {
                const timeframe = document.getElementById('dashboard-timeframe').value;
                const customDiv = document.getElementById('custom-date-range');
                if (timeframe === 'CUSTOM') {
                    customDiv.classList.remove('hidden');
                } else {
                    customDiv.classList.add('hidden');
                }
                this.triggerGlobalAuditRefresh();
            }

            // Centralized Timeframe Logic
            static isDateInTimeframe(dateStr, timeframe) {
                if (timeframe === 'ALL_TIME') return true;
                
                const targetDate = this.parseIndianDate(dateStr);
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                
                if (timeframe === 'TODAY') {
                    return targetDate.getTime() === today.getTime();
                }
                if (timeframe === 'YESTERDAY') {
                    const yesterday = new Date(today.getTime() - (24 * 60 * 60 * 1000));
                    return targetDate.getTime() >= yesterday.getTime() && targetDate.getTime() < today.getTime();
                }
                if (timeframe === 'THIS_WEEK') {
                    const day = today.getDay() || 7; 
                    const startOfWeek = new Date(today.getTime() - (day - 1) * 24 * 60 * 60 * 1000);
                    return targetDate.getTime() >= startOfWeek.getTime();
                }
                if (timeframe === 'THIS_MONTH') {
                    return targetDate.getMonth() === today.getMonth() && targetDate.getFullYear() === today.getFullYear();
                }
                if (timeframe === 'THIS_YEAR') {
                    return targetDate.getFullYear() === today.getFullYear();
                }
                if (timeframe === 'CUSTOM') {
                    const startStr = document.getElementById('dash-start-date').value;
                    const endStr = document.getElementById('dash-end-date').value;
                    if(!startStr || !endStr) return true; 
                    
                    const startDt = new Date(startStr);
                    startDt.setHours(0,0,0,0);
                    const endDt = new Date(endStr);
                    endDt.setHours(23,59,59,999);
                    
                    const targetTime = targetDate.getTime();
                    return targetTime >= startDt.getTime() && targetTime <= endDt.getTime();
                }
                return true;
            }

            static populateVisitMedicineOptions() {
                const rxSelect = document.getElementById('v-medicine');
                const treatSelect = document.getElementById('v-treatment-medicine');
                if(!rxSelect && !treatSelect) return;
                const db = SystemStorage.read();
                const inventory = Array.isArray(db.inventory) ? [...db.inventory].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];
                
                const optionsHtml = '<option value="" data-type="" data-unitqty="">Select medicine from stock</option>' + 
                    inventory.map(item => `<option value="${item.name}" data-type="${item.type || ''}" data-unitqty="${item.unitQty || 1}">${item.name}</option>`).join('');
                
                if (rxSelect) rxSelect.innerHTML = optionsHtml;
                if (treatSelect) treatSelect.innerHTML = optionsHtml;
            }

            static handlePrescriptionMedicineChange() {
                const select = document.getElementById('v-medicine');
                const mlContainer = document.getElementById('v-ml-container');
                const mlInput = document.getElementById('v-ml-input');
                if(!select || !mlContainer) return;
                
                const option = select.options[select.selectedIndex];
                if (option && option.dataset.type === 'Vial') {
                    mlContainer.classList.remove('hidden');
                } else {
                    mlContainer.classList.add('hidden');
                    mlInput.value = "";
                }
            }

            static loadClinicProfile() {
                const db = SystemStorage.read();
                const clinic = db.clinicProfile || {};
                const map = {
                    'clinic-name': clinic.name || '',
                    'clinic-address': clinic.address || '',
                    'clinic-mobile': clinic.mobile || '',
                    'clinic-regno': clinic.regno || '',
                    'clinic-doctor': clinic.doctor || ''
                };
                Object.entries(map).forEach(([id, value]) => {
                    const el = document.getElementById(id);
                    if (el) el.value = value;
                });
            }

            static saveClinicProfile() {
                const db = SystemStorage.read();
                db.clinicProfile = {
                    name: document.getElementById('clinic-name')?.value.trim() || '',
                    address: document.getElementById('clinic-address')?.value.trim() || '',
                    mobile: document.getElementById('clinic-mobile')?.value.trim() || '',
                    regno: document.getElementById('clinic-regno')?.value.trim() || '',
                    doctor: document.getElementById('clinic-doctor')?.value.trim() || ''
                };
                SystemStorage.write(db);
                alert('Clinic details saved successfully.');
            }

            static getPatientExportData(patientId) {
                const db = SystemStorage.read();
                const patient = db.patients.find(p => p.id === patientId);
                const visits = db.visits.filter(v => v.patientId === patientId);
                return { clinic: db.clinicProfile || {}, patient, visits };
            }

            static buildPatientPrescriptionHTML(patientId) {
                const { clinic, patient, visits } = this.getPatientExportData(patientId);
                if (!patient) return '';
                const latestVisit = visits.length ? visits[visits.length - 1] : null;
                const rxText = latestVisit?.prescription || 'No prescription saved';
                const complaint = latestVisit?.complaint || 'Not recorded';
                const diagnosis = latestVisit?.diagnosis || 'Not recorded';
                const visitDate = latestVisit?.date || new Date().toLocaleDateString('en-IN');
                
                const vitalsHtml = latestVisit?.vitals && (latestVisit.vitals.bp || latestVisit.vitals.pulse || latestVisit.vitals.spo2 || latestVisit.vitals.rbs) ? `
                    <div style="font-size:12px; border-bottom:1px solid #cbd5e1; padding-bottom:8px; margin-bottom:12px; display:flex; gap:16px;">
                        ${latestVisit.vitals.bp ? `<div><b>BP:</b> ${latestVisit.vitals.bp}</div>` : ''}
                        ${latestVisit.vitals.pulse ? `<div><b>Pulse:</b> ${latestVisit.vitals.pulse} bpm</div>` : ''}
                        ${latestVisit.vitals.spo2 ? `<div><b>SpO2:</b> ${latestVisit.vitals.spo2}%</div>` : ''}
                        ${latestVisit.vitals.rbs ? `<div><b>RBS:</b> ${latestVisit.vitals.rbs} mg/dL</div>` : ''}
                    </div>` : '';

                const treatmentHtml = latestVisit?.treatmentType && latestVisit.treatmentType !== 'None' ? `
                    <div style="margin-bottom:12px;">
                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#0f766e;text-transform:uppercase;margin-bottom:5px;">Administered ${latestVisit.treatmentType}</div>
                        <div style="min-height:40px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.6;background:#fef2f2;white-space:pre-wrap;">${latestVisit.treatmentPlan || 'No records'}</div>
                    </div>` : '';

                return `
                    <div id="patient-export-sheet" style="font-family:'Arial',sans-serif;background:#ffffff;color:#0f172a;padding:28px;width:794px;max-width:100%;margin:0 auto;">
                        <div style="border:2px solid #0f766e;border-radius:14px;overflow:hidden;">
                            <div style="padding:18px 22px;border-bottom:3px solid #0f766e;text-align:center;background:#f0fdfa;">
                                <div style="font-size:28px;font-weight:800;letter-spacing:.3px;color:#0f766e;text-transform:uppercase;">${clinic.name || 'Clinic Name'}</div>
                                <div style="font-size:13px;color:#334155;margin-top:6px;">${clinic.address || 'Clinic Address'}</div>
                                <div style="font-size:13px;color:#334155;margin-top:4px;">Consultant: ${clinic.doctor || 'Consultant Name'} | Reg. No.: ${clinic.regno || 'Not set'} | Contact: ${clinic.mobile || 'Not set'}</div>
                            </div>
                            <div style="padding:18px 22px 10px;">
                                <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:10px 18px;font-size:13px;border-bottom:1px solid #cbd5e1;padding-bottom:12px;">
                                    <div><span style="font-weight:700;">Patient Name:</span> ${patient.name || 'Not recorded'}</div>
                                    <div><span style="font-weight:700;">Age/Sex:</span> ${patient.ageVal || ''} ${patient.ageUnit || ''}</div>
                                    <div><span style="font-weight:700;">Date:</span> ${visitDate}</div>
                                    <div><span style="font-weight:700;">Address:</span> ${patient.address || 'Not recorded'}</div>
                                    <div><span style="font-weight:700;">Contact:</span> ${patient.mobile || 'Not recorded'}</div>
                                    <div><span style="font-weight:700;">Weight:</span> ${patient.weight ? patient.weight + ' kg' : 'Not recorded'}</div>
                                </div>
                                <div style="margin-top:14px;display:grid;gap:12px;">
                                    ${vitalsHtml}
                                    <div>
                                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#0f766e;text-transform:uppercase;margin-bottom:5px;">Complaint</div>
                                        <div style="min-height:48px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.6;background:#f8fafc;">${complaint}</div>
                                    </div>
                                    <div>
                                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#0f766e;text-transform:uppercase;margin-bottom:5px;">Diagnosis</div>
                                        <div style="min-height:48px;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;line-height:1.6;background:#f8fafc;">${diagnosis}</div>
                                    </div>
                                    ${treatmentHtml}
                                    <div>
                                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#0f766e;text-transform:uppercase;margin-bottom:5px;">Prescription</div>
                                        <div style="min-height:220px;border:1.5px solid #94a3b8;border-radius:10px;padding:14px 14px 16px;font-size:15px;line-height:1.9;white-space:pre-wrap;background:#ffffff;">℞\n${rxText}</div>
                                    </div>
                                    <div>
                                        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#0f766e;text-transform:uppercase;margin-bottom:5px;">Clinical Notes</div>
                                        <div style="min-height:40px;border:1px dashed #cbd5e1;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;background:#fcfcfd;">History / Allergies: ${patient.allergies || 'None recorded'}</div>
                                    </div>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:28px;">
                                    <div style="font-size:11px;color:#64748b;max-width:60%;">This prescription is generated from clinic records via MediPilot. Please review medicines before printing.</div>
                                    <div style="min-width:210px;text-align:center;">
                                        <div style="border-top:1px solid #334155;padding-top:8px;font-size:13px;font-weight:700;color:#0f172a;">${clinic.doctor || 'Consultant Name'}</div>
                                        <div style="font-size:12px;color:#64748b;">Authorized Signatory</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            static exportPatientPrescriptionPDF(patientId) {
                const { patient } = this.getPatientExportData(patientId);
                if (!patient) return;
                const html = this.buildPatientPrescriptionHTML(patientId);
                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                const node = wrapper.firstElementChild;
                document.body.appendChild(node);
                const opt = {
                    margin: 0.3,
                    filename: `${patient.name.replace(/\s+/g, '_')}_prescription_history.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().set(opt).from(node).save().then(() => node.remove()).catch(() => node.remove());
            }

            static sharePatientPrescriptionWhatsApp(patientId) {
                const { clinic, patient, visits } = this.getPatientExportData(patientId);
                if (!patient) return;
                const historyText = visits.length
                    ? visits.map((visit, index) => {
                        let vitalsStr = visit.vitals && (visit.vitals.bp || visit.vitals.pulse || visit.vitals.spo2 || visit.vitals.rbs) 
                            ? `Vitals: BP: ${visit.vitals.bp||'--'} | PR: ${visit.vitals.pulse||'--'} | SpO2: ${visit.vitals.spo2||'--'} | RBS: ${visit.vitals.rbs||'--'}` 
                            : '';
                        let treatStr = visit.treatmentType && visit.treatmentType !== 'None'
                            ? `Treatment (${visit.treatmentType}): \n${visit.treatmentPlan || 'N/A'}` : '';

                        return [
                            `${index + 1}. Date: ${visit.date}`,
                            vitalsStr,
                            `Complaint: ${visit.complaint || 'Not recorded'}`,
                            `Diagnosis: ${visit.diagnosis || 'Not recorded'}`,
                            treatStr,
                            `Prescription: \n${visit.prescription || 'No prescription saved'}`
                        ].filter(Boolean).join('\n')
                    }).join('\n\n')
                    : 'No consultation history available.';
                
                const message = [
                    clinic.name || 'Clinic Name',
                    clinic.address || 'Clinic Address',
                    `Mobile: ${clinic.mobile || 'Not set'}`,
                    `Reg. No.: ${clinic.regno || 'Not set'}`,
                    `Doctor: ${clinic.doctor || 'Not set'}`,
                    '',
                    `Patient: ${patient.name} (${patient.id})`,
                    `Mobile: ${patient.mobile || 'Not recorded'}`,
                    `Age: ${patient.ageVal} ${patient.ageUnit || ''}`,
                    `Weight: ${patient.weight ? patient.weight + ' kg' : 'Not recorded'}`,
                    `Address: ${patient.address || 'Not recorded'}`,
                    `History/Allergies: ${patient.allergies || 'None recorded'}`,
                    '',
                    'Complaint History & Prescriptions (MediPilot System)',
                    historyText
                ].join('\n');
                window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
            }

            static initializeApplicationRuntime() {
                document.querySelectorAll('.nav-link').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active-tab'));
                        btn.classList.add('active-tab');
                        
                        const target = btn.getAttribute('data-target');
                        document.querySelectorAll('.erp-section').forEach(sec => sec.classList.add('hidden'));
                        document.getElementById(`mod-${target}`).classList.remove('hidden');
                        
                        document.getElementById('sidebar').classList.add('hidden');
                        document.getElementById('sidebar').classList.remove('flex');
                    });
                });

                document.getElementById('mobile-menu-btn').addEventListener('click', () => {
                    const sb = document.getElementById('sidebar');
                    if(sb.classList.contains('hidden')) {
                        sb.classList.remove('hidden');
                        sb.classList.add('flex');
                    } else {
                        sb.classList.add('hidden');
                        sb.classList.remove('flex');
                    }
                });

                document.getElementById('dash-date').innerText = new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                document.getElementById('patient-search').addEventListener('input', (e) => UI.renderPatientsGrid(e.target.value));

                this.loadClinicProfile();
                this.triggerGlobalAuditRefresh();
            }

            static routeToTab(targetTabId) {
                const targetLink = document.querySelector(`.nav-link[data-target="${targetTabId}"]`);
                if(targetLink) targetLink.click();
            }

            static openModal(id) { 
                document.getElementById(id).classList.remove('hidden'); 
            }
            static closeModal(id) { document.getElementById(id).classList.add('hidden'); }

            static openCreditsModal() {
                this.renderCreditsList();
                this.openModal('modal-credits');
            }

            static triggerGlobalAuditRefresh() {
                const db = SystemStorage.read();
                const timeframe = document.getElementById('dashboard-timeframe')?.value || 'TODAY';
                
                // FILTER: Finance Logic base on timeframe
                const filteredFinance = db.finance.filter(f => this.isDateInTimeframe(f.date, timeframe));
                let totalRevenue = filteredFinance.filter(f => f.type === "INFLOW").reduce((a,c) => a+c.amount, 0);
                let totalExpenses = filteredFinance.filter(f => f.type === "OUTFLOW").reduce((a,c) => a+c.amount, 0);
                
                // FILTER: Visits Logic for OPD base on timeframe
                const filteredVisits = db.visits.filter(v => this.isDateInTimeframe(v.date, timeframe));
                const totalOPD = filteredVisits.length;

                // Overall Non-Filtered Master Metrics
                let stockAssetValue = db.inventory.reduce((a,c) => a + (c.qty * c.selling), 0);
                let totalStockValuePTR = db.inventory.reduce((a, c) => a + (c.qty * c.purchase), 0);
                let lowStockCount = db.inventory.filter(i => i.qty <= 15).length;
                let today = new Date();
                let sixMonthsHence = new Date(today.getTime() + (180 * 24 * 60 * 60 * 1000));
                let nearExpiryCount = db.inventory.filter(i => {
                    let expDate = new Date(i.expiry + "-01");
                    return expDate >= today && expDate <= sixMonthsHence;
                }).length;

                // Update DOM Matrix
                document.getElementById('stat-total-patients').innerText = totalOPD;
                document.getElementById('stat-total-revenue').innerText = `₹${totalRevenue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                document.getElementById('stat-stock-value').innerText = `₹${stockAssetValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;

                document.getElementById('inv-ptr-val').innerText = `₹${totalStockValuePTR.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
                document.getElementById('inv-low-count').innerText = lowStockCount;
                document.getElementById('inv-expiry-count').innerText = nearExpiryCount;

                this.renderPatientsGrid();
                this.renderInventoryGrid(db, this.currentInventoryFilter);
                this.renderFinanceLedgerGrid(db);
                this.syncBillingDropdowns(db);
                this.syncOTCDropdowns(db);
                
                // Update Dashboard Charts & Feed with Filtered Inputs
                this.renderAnalyticsMatrixCharts(totalRevenue, totalExpenses);
                this.renderDashboardRecentPatients(db, filteredVisits);
            }

            static syncOTCDropdowns(db) {
                const select = document.getElementById('otc-medicine-select');
                if (select) {
                    select.innerHTML = '<option value="" disabled selected>-- Select Medicine --</option>' + 
                        db.inventory.filter(i => i.qty > 0).map(i => `<option value="${i.id}">${i.name} (Stock: ${parseFloat(Number(i.qty).toFixed(2))})</option>`).join('');
                }
            }

            // ================= CREDIT MANAGEMENT LOGIC =================
            static renderCreditsList() {
                const db = SystemStorage.read();
                const container = document.getElementById('credits-list');
                const activeCredits = (db.credits || []).filter(c => c.paidAmount < c.totalAmount);
                
                if (activeCredits.length === 0) {
                    container.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500 text-center font-medium">No active credit accounts found.</div>`;
                    return;
                }

                container.innerHTML = activeCredits.map(c => {
                    const remaining = c.totalAmount - c.paidAmount;
                    return `
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row justify-between items-center gap-4">
                        <div class="flex-1 w-full text-left">
                            <div class="text-[10px] font-black uppercase tracking-wide text-teal-600">${c.ref} • ${c.date}</div>
                            <div class="text-sm font-bold text-slate-800 mt-0.5">${c.patientName}</div>
                            <div class="text-xs text-slate-500 mt-1 font-medium">Total: ₹${c.totalAmount.toFixed(2)} | Paid: ₹${c.paidAmount.toFixed(2)} | <span class="text-rose-600 font-bold">Remaining: ₹${remaining.toFixed(2)}</span></div>
                        </div>
                        <div class="flex items-center gap-2 self-start md:self-auto w-full md:w-auto">
                            <input type="number" id="pay-input-${c.id}" max="${remaining}" placeholder="Enter amount" class="w-full md:w-32 p-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
                            <button onclick="UI.receiveCreditPayment('${c.id}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer active:scale-[0.96] whitespace-nowrap">Receive</button>
                        </div>
                    </div>
                    `;
                }).join('');
            }

            static receiveCreditPayment(creditId) {
                const input = document.getElementById(`pay-input-${creditId}`);
                const amount = parseFloat(input.value);
                
                if(isNaN(amount) || amount <= 0) { alert("Please enter a valid payment amount."); return; }
                
                const db = SystemStorage.read();
                const credit = db.credits.find(c => c.id === creditId);
                if(!credit) return;
                
                const remaining = credit.totalAmount - credit.paidAmount;
                if(amount > remaining) { alert(`Amount cannot exceed the remaining balance of ₹${remaining.toFixed(2)}`); return; }
                
                credit.paidAmount += amount;
                
                db.finance.push({
                    type: "INFLOW",
                    category: "Credit Payment Settlement",
                    ref: credit.ref,
                    amount: amount,
                    date: new Date().toLocaleDateString('en-IN')
                });
                
                SystemStorage.write(db);
                this.renderCreditsList();
                alert(`Success: Payment of ₹${amount.toFixed(2)} received successfully for ${credit.patientName}. Ledger updated.`);
            }

            // ================= OTC MODULE LOGIC =================
            static addOTCToCart() {
                const medId = document.getElementById('otc-medicine-select').value;
                const qty = parseInt(document.getElementById('otc-qty').value);
                
                if (!medId || isNaN(qty) || qty <= 0) {
                    alert("Please select a valid medicine and quantity.");
                    return;
                }
                
                const db = SystemStorage.read();
                const med = db.inventory.find(i => i.id === medId);
                
                if (!med) return;
                
                const existing = this.otcCart.find(item => item.id === medId);
                const currentCartQty = existing ? existing.qty : 0;
                
                if (currentCartQty + qty > med.qty) {
                    alert(`Insufficient stock! You only have ${parseFloat(Number(med.qty).toFixed(2))} left in inventory.`);
                    return;
                }
                
                if (existing) {
                    existing.qty += qty;
                } else {
                    this.otcCart.push({ id: med.id, name: med.name, qty: qty });
                }
                
                document.getElementById('otc-qty').value = 1;
                document.getElementById('otc-medicine-select').selectedIndex = 0;
                this.renderOTCCart();
            }

            static removeOTCFromCart(index) {
                this.otcCart.splice(index, 1);
                this.renderOTCCart();
            }

            static renderOTCCart() {
                const tbody = document.getElementById('otc-cart-body');
                
                if (this.otcCart.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400 text-xs italic font-medium">Cart allocations are currently blank.</td></tr>`;
                    this.renderOTCUPIQR();
                    return;
                }
                
                tbody.innerHTML = this.otcCart.map((item, index) => {
                    return `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 font-medium text-xs">
                        <td class="p-3 font-bold text-slate-700">${item.name}</td>
                        <td class="p-3 text-center text-slate-600 font-bold">${item.qty}</td>
                        <td class="p-3 text-center">
                            <button onclick="UI.removeOTCFromCart(${index})" class="text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"><i class="fa-solid fa-xmark"></i></button>
                        </td>
                    </tr>
                    `;
                }).join('');
                
                this.renderOTCUPIQR(); 
            }

            static renderOTCUPIQR() {
                const mode = document.getElementById('otc-payment-mode').value;
                const manualAmount = parseFloat(document.getElementById('otc-receive-amount').value) || 0;
                const upiId = document.getElementById('otc-clinic-upi-id').value.trim();
                
                const configArea = document.getElementById('otc-upi-config-area');
                const qrContainer = document.getElementById('otc-upi-qr-container');
                const qrDiv = document.getElementById('otc-qrcode');
                const displayAmount = document.getElementById('otc-qr-amount-display');

                if (mode === 'UPI') {
                    if (configArea) configArea.classList.remove('hidden');
                    
                    if (manualAmount > 0 && upiId) {
                        qrContainer.classList.remove('hidden');
                        const upiString = `upi://pay?pa=${upiId}&pn=CareSuite%20Clinic&am=${manualAmount.toFixed(2)}&cu=INR`;
                        displayAmount.innerText = manualAmount.toFixed(2);
                        qrDiv.innerHTML = "";

                        if(typeof QRCode !== 'undefined') {
                            this.otcQrCodeInstance = new QRCode(qrDiv, {
                                text: upiString,
                                width: 200,
                                height: 200,
                                colorDark : "#0f172a",
                                colorLight : "#ffffff",
                                correctLevel : QRCode.CorrectLevel.H
                            });
                        }
                    } else {
                        qrContainer.classList.add('hidden');
                    }
                } else {
                    if (configArea) configArea.classList.add('hidden');
                    qrContainer.classList.add('hidden');
                }
            }

            static commitOTCSale() {
                if (this.otcCart.length === 0) {
                    alert("Please add items to the cart first.");
                    return;
                }
                
                const manualAmount = parseFloat(document.getElementById('otc-receive-amount').value);
                if (isNaN(manualAmount) || manualAmount <= 0) {
                    alert("Please enter a valid Receive Amount greater than 0.");
                    return;
                }
                
                const db = SystemStorage.read();
                const mode = document.getElementById('otc-payment-mode').value;
                
                // Deduct from Inventory
                this.otcCart.forEach(cartItem => {
                    const invItem = db.inventory.find(i => i.id === cartItem.id);
                    if (invItem) {
                        invItem.qty = Math.max(0, invItem.qty - cartItem.qty);
                    }
                });
                
                const refCode = `OTC-${Math.floor(100000 + Math.random() * 900000)}`;
                db.finance.push({
                    type: "INFLOW",
                    category: `OTC Pharmacy Sales [${mode}]`,
                    ref: refCode,
                    amount: manualAmount,
                    date: new Date().toLocaleDateString('en-IN')
                });
                
                SystemStorage.write(db);
                
                this.otcCart = [];
                document.getElementById('otc-receive-amount').value = "";
                this.renderOTCCart();
                
                alert(`Success! OTC sale recorded (Ref: ${refCode}). Total: ₹${manualAmount.toFixed(2)} updated in Ledger.`);
                this.routeToTab('dashboard');
            }

            // ===============================================

            static renderPatientsGrid(filterTerm = "") {
                const db = SystemStorage.read();
                const container = document.getElementById('patients-table-body');
                if(!container) return;
                container.innerHTML = "";

                const filtered = db.patients.filter(p => 
                    p.name.toLowerCase().includes(filterTerm.toLowerCase()) || 
                    p.id.toLowerCase().includes(filterTerm.toLowerCase()) ||
                    p.mobile.includes(filterTerm)
                );

                if(filtered.length === 0) {
                    container.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 italic font-medium">No matching case records found.</td></tr>`;
                    return;
                }

                filtered.forEach(p => {
                    const visitsCount = db.visits.filter(v => v.patientId === p.id).length;
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-200 hover:bg-slate-50/50 font-medium text-slate-600 transition-colors";
                    tr.innerHTML = `
                        <td class="p-4 font-mono font-bold text-slate-900 text-xs">${p.id}</td>
                        <td class="p-4">
                            <div class="font-bold text-slate-800">${p.name}</div>
                            <div class="text-[11px] text-slate-400 font-medium">Address: ${p.address || 'Not Recorded'}</div>
                            <div class="text-[11px] text-slate-400 font-medium">History/Allergies: ${p.allergies || 'None recorded'}</div>
                        </td>
                        <td class="p-4 text-xs font-semibold text-slate-700">${p.ageVal} ${p.ageUnit}</td>
                        <td class="p-4 text-xs font-bold text-teal-700">${p.weight ? p.weight + ' kg' : '--'}</td>
                        <td class="p-4 text-center"><button onclick="UI.viewPatientConsultations('${p.id}')" class="bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 font-bold px-3 py-1 rounded-full text-[11px] transition-all cursor-pointer">${visitsCount} Prescriptions</button></td>
                        <td class="p-4 text-right space-x-1 whitespace-nowrap">
                            <button onclick="UI.initiateVisitModal('${p.id}')" title="Clinical Notes" class="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-notes-medical"></i></button>
                            <button onclick="UI.editLatestPrescription('${p.id}')" title="Edit Prescription" class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="UI.sharePatientPrescriptionWhatsApp('${p.id}')" title="Share WhatsApp" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-brands fa-whatsapp"></i></button>
                            <button onclick="UI.deletePatientRecord('${p.id}')" title="Delete Profile" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>
                        </td>
                    `;
                    container.appendChild(tr);
                });
            }

            static viewPatientConsultations(patientId) {
                const db = SystemStorage.read();
                const patient = db.patients.find(p => p.id === patientId);
                const visits = db.visits
                    .filter(v => v.patientId === patientId)
                    .sort((a, b) => this.parseIndianDate(b.date) - this.parseIndianDate(a.date));

                const meta = document.getElementById('consultations-patient-meta');
                const list = document.getElementById('consultations-history-list');
                if (!meta || !list) return;

                meta.textContent = patient ? `${patient.name} • ${patient.id} • Total Consultations: ${visits.length}` : `Patient ID: ${patientId}`;

                if (!visits.length) {
                    list.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500 font-medium text-center">No previous prescriptions found for this patient.</div>`;
                    this.openModal('modal-consultations');
                    return;
                }

                list.innerHTML = visits.map((visit, index) => {
                    let vitalsHtml = visit.vitals && (visit.vitals.bp || visit.vitals.pulse || visit.vitals.spo2 || visit.vitals.rbs) ? `
                        <div class="text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-200 mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 font-semibold">
                            ${visit.vitals.bp ? `<div><span class="text-slate-400 font-extrabold uppercase">BP:</span> ${visit.vitals.bp}</div>` : ''}
                            ${visit.vitals.pulse ? `<div><span class="text-slate-400 font-extrabold uppercase">Pulse:</span> ${visit.vitals.pulse}</div>` : ''}
                            ${visit.vitals.spo2 ? `<div><span class="text-slate-400 font-extrabold uppercase">SpO2:</span> ${visit.vitals.spo2}%</div>` : ''}
                            ${visit.vitals.rbs ? `<div><span class="text-slate-400 font-extrabold uppercase">RBS:</span> ${visit.vitals.rbs}</div>` : ''}
                        </div>` : '';
                    
                    let treatHtml = visit.treatmentType && visit.treatmentType !== 'None' ? `
                        <div class="mt-2">
                            <div class="text-[10px] font-extrabold uppercase tracking-wide text-rose-600 mb-1">Administered ${visit.treatmentType}</div>
                            <div class="text-rose-700 bg-rose-50/60 p-2.5 rounded-xl text-xs font-mono font-medium whitespace-pre-wrap border border-rose-100">${visit.treatmentPlan || 'N/A'}</div>
                        </div>` : '';

                    return `
                    <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                        <div class="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div class="text-[10px] font-black uppercase tracking-wider text-teal-600">Consultation ${visits.length - index}</div>
                                <div class="text-xs font-bold text-slate-800 mt-0.5">Date Vector: ${visit.date}</div>
                            </div>
                            <span class="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold font-mono">${visit.id}</span>
                        </div>
                        ${vitalsHtml}
                        <div class="grid gap-3 text-sm mt-3">
                            <div>
                                <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-0.5">Complaint context</div>
                                <div class="text-slate-700 text-xs font-medium">${visit.complaint || 'Not recorded'}</div>
                            </div>
                            <div>
                                <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-0.5">Diagnosis evaluations</div>
                                <div class="text-slate-700 text-xs font-medium">${visit.diagnosis || 'Not recorded'}</div>
                            </div>
                            ${treatHtml}
                            <div>
                                <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Prescription Directives Matrix</div>
                                <div class="text-slate-800 font-mono text-xs font-medium bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap leading-relaxed">${visit.prescription || 'No prescription saved'}</div>
                            </div>
                        </div>
                    </div>`
                }).join('');

                this.openModal('modal-consultations');
            }

            static deletePatientRecord(id) {
                if(confirm("Confirm action: Do you want to remove this patient file permanently? This wipes out associated diagnostic visit histories.")) {
                    const db = SystemStorage.read();
                    db.patients = db.patients.filter(p => p.id !== id);
                    db.visits = db.visits.filter(v => v.patientId !== id);
                    SystemStorage.write(db);
                }
            }

            static handleAgeChange() {
                const ageInput = document.getElementById('p-age-val');
                const weightContainer = document.getElementById('p-weight-container');
                const weightInput = document.getElementById('p-weight');
                
                if(!ageInput || !weightContainer) return;
                
                const ageVal = parseInt(ageInput.value) || 0;
                
                if (ageVal > 0 && ageVal <= 15) {
                    weightContainer.classList.remove('hidden');
                    weightInput.setAttribute('required', 'true');
                } else {
                    weightContainer.classList.add('hidden');
                    weightInput.removeAttribute('required');
                    weightInput.value = '';
                }
            }

            static openPatientModal() {
                document.getElementById('form-patient').reset();
                this.handleAgeChange();
                this.openModal('modal-patient');
            }

            static toggleInventoryFilter(filterType) {
                if (this.currentInventoryFilter === filterType) {
                    this.currentInventoryFilter = null;
                    document.getElementById('btn-filter-low').classList.remove('bg-rose-50', 'border-rose-400');
                    document.getElementById('btn-filter-expiry').classList.remove('bg-amber-50', 'border-amber-400');
                } else {
                    this.currentInventoryFilter = filterType;
                    document.getElementById('btn-filter-low').classList.toggle('bg-rose-50', filterType === 'LOW_STOCK');
                    document.getElementById('btn-filter-low').classList.toggle('border-rose-400', filterType === 'LOW_STOCK');
                    document.getElementById('btn-filter-expiry').classList.toggle('bg-amber-50', filterType === 'NEAR_EXPIRY');
                    document.getElementById('btn-filter-expiry').classList.toggle('border-amber-400', filterType === 'NEAR_EXPIRY');
                }
                this.renderInventoryGrid(SystemStorage.read(), this.currentInventoryFilter);
            }

            static renderInventoryGrid(db, filter = null) {
                const container = document.getElementById('inventory-table-body');
                if(!container) return;
                container.innerHTML = "";

                let datasets = db.inventory;
                
                if (filter === 'LOW_STOCK') {
                    datasets = datasets.filter(i => i.qty <= 15);
                } else if (filter === 'NEAR_EXPIRY') {
                    let today = new Date();
                    let sixMonthsHence = new Date(today.getTime() + (180 * 24 * 60 * 60 * 1000));
                    datasets = datasets.filter(i => {
                        let expDate = new Date(i.expiry + "-01");
                        return expDate >= today && expDate <= sixMonthsHence;
                    });
                }

                if(datasets.length === 0) {
                    container.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-400 italic font-medium">No matching medicine batches found in this layer context.</td></tr>`;
                    return;
                }

                datasets.forEach(i => {
                    let statusBadge = `<span class="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-xl font-bold">In Stock</span>`;
                    if (i.qty <= 15) statusBadge = `<span class="bg-rose-50 text-rose-700 text-xs px-2.5 py-1 rounded-xl font-bold">Low Level</span>`;
                    if (i.qty <= 0) statusBadge = `<span class="bg-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded-xl font-bold">Depleted</span>`;

                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-200 hover:bg-slate-50/50 text-slate-600 font-medium transition-colors text-xs";
                    tr.innerHTML = `
                        <td class="p-4">
                            <div class="font-bold text-slate-800 text-sm"><span class="text-teal-600 mr-1.5">[${i.type || 'N/A'}]</span>${i.name}</div>
                            <div class="text-[11px] text-slate-400 font-medium mt-0.5">${i.generic || 'Generic Composition Clear'} • ${i.unitQty ? i.unitQty + ' Units/Pkg' : ''}</div>
                        </td>
                        <td class="p-4 text-slate-500 font-semibold">${i.supplier || 'N/A'}</td>
                        <td class="p-4 font-bold text-slate-700 font-mono">${i.expiry}</td>
                        <td class="p-4 text-center font-black text-slate-800">${parseFloat(Number(i.qty).toFixed(2))} units</td>
                        <td class="p-4 text-right leading-relaxed font-semibold">PTR: <span class="text-slate-500">₹${Number(i.purchase).toFixed(2)}</span><br><span class="text-slate-900 font-black">MRP: ₹${Number(i.selling).toFixed(2)}</span></td>
                        <td class="p-4 text-center">${statusBadge}</td>
                        <td class="p-4 text-right space-x-1 whitespace-nowrap">
                            <button onclick="UI.editInventoryRecord('${i.id}')" title="Edit Stock Item" class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="UI.deleteInventoryRecord('${i.id}')" title="Delete Stock Item" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>
                        </td>
                    `;
                    container.appendChild(tr);
                });
            }

            static deleteInventoryRecord(id) {
                if(confirm("Confirm item drop: Erase target batch parameters entirely from stock indexes?")) {
                    const db = SystemStorage.read();
                    db.inventory = db.inventory.filter(i => i.id !== id);
                    SystemStorage.write(db);
                }
            }

            static populateExpiryYears() {
                const yearSelect = document.getElementById('m-expiry-year');
                if(yearSelect && yearSelect.options.length <= 1) { 
                    yearSelect.innerHTML = '<option value="" disabled selected>YYYY</option>';
                    const currentYear = new Date().getFullYear();
                    for(let y = currentYear; y <= 2080; y++) {
                        yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
                    }
                }
            }

            static handleMedTypeChange() {
                const typeVal = document.getElementById('m-type').value;
                const otherContainer = document.getElementById('m-type-other-container');
                const otherInput = document.getElementById('m-type-other');
                if(typeVal === 'Other') {
                    otherContainer.classList.remove('hidden');
                    otherInput.setAttribute('required', 'true');
                } else {
                    otherContainer.classList.add('hidden');
                    otherInput.removeAttribute('required');
                    otherInput.value = '';
                }
            }

            static initMedicineModal() {
                document.getElementById('form-medicine').reset();
                document.getElementById('m-edit-id').value = "";
                document.getElementById('m-type-other-container').classList.add('hidden'); 
                document.getElementById('m-type-other').removeAttribute('required');

                this.populateExpiryYears(); 

                document.getElementById('medicine-modal-title').innerHTML = '<i class="fa-solid fa-pills mr-2 text-emerald-400"></i>Register New Stock Component';
                document.getElementById('medicine-submit-btn').innerText = "Commit Pharmaceutical Batch to Stock";
                
                const select = document.getElementById('m-supplier');
                if(select) {
                    const db = SystemStorage.read();
                    select.innerHTML = (db.suppliers || []).map(s => `<option value="${s.name}">${s.name}</option>`).join('') || '<option value="">No vendors active</option>';
                }
                
                this.openModal('modal-medicine');
            }

            static editInventoryRecord(id) {
                const db = SystemStorage.read();
                const item = db.inventory.find(i => i.id === id);
                if(!item) return;

                this.initMedicineModal();
                
                const typeSelect = document.getElementById('m-type');
                const standardTypes = ["Tablet", "Capsule", "Syrup", "Ointment", "Drop", "Vial", "Ampule", "SN", "Lotion", "Sachet", "Nab"];
                if (item.type) {
                    if(standardTypes.includes(item.type)) {
                        typeSelect.value = item.type;
                        this.handleMedTypeChange();
                    } else {
                        typeSelect.value = "Other";
                        this.handleMedTypeChange();
                        document.getElementById('m-type-other').value = item.type;
                    }
                } else {
                    typeSelect.value = "";
                    this.handleMedTypeChange();
                }

                if(item.expiry) {
                    const parts = item.expiry.split('-');
                    if(parts.length === 2) {
                        document.getElementById('m-expiry-year').value = parts[0];
                        document.getElementById('m-expiry-month').value = parts[1];
                    }
                }

                document.getElementById('m-edit-id').value = item.id;
                document.getElementById('m-unit-qty').value = item.unitQty || 1;
                document.getElementById('m-name').value = item.name;
                document.getElementById('m-generic').value = item.generic || '';
                document.getElementById('m-supplier').value = item.supplier || '';
                document.getElementById('m-qty').value = item.qty;
                document.getElementById('m-purchase').value = item.purchase;
                document.getElementById('m-selling').value = item.selling;

                document.getElementById('medicine-modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square mr-2 text-amber-500"></i>Update Medicine Properties';
                document.getElementById('medicine-submit-btn').innerText = "Update Structural Stock Parameters";
            }

            static handleMedicineSubmit(e) {
                e.preventDefault();
                const db = SystemStorage.read();
                const editId = document.getElementById('m-edit-id').value;

                const medType = document.getElementById('m-type').value;
                const actualType = medType === 'Other' ? document.getElementById('m-type-other').value.trim() : medType;
                
                const yearVal = document.getElementById('m-expiry-year').value;
                const monthVal = document.getElementById('m-expiry-month').value;
                const expiryVal = `${yearVal}-${monthVal}`;

                const payload = {
                    id: editId || `MED-${Math.floor(1000 + Math.random() * 9000)}`,
                    type: actualType,
                    name: document.getElementById('m-name').value.trim(),
                    generic: document.getElementById('m-generic').value.trim(),
                    supplier: document.getElementById('m-supplier').value,
                    expiry: expiryVal,
                    unitQty: parseInt(document.getElementById('m-unit-qty').value) || 1,
                    qty: parseFloat(document.getElementById('m-qty').value) || 0,
                    purchase: parseFloat(document.getElementById('m-purchase').value) || 0,
                    selling: parseFloat(document.getElementById('m-selling').value) || 0
                };

                if(editId) {
                    const idx = db.inventory.findIndex(i => i.id === editId);
                    if(idx !== -1) db.inventory[idx] = payload;
                } else {
                    db.inventory.push(payload);
                }

                SystemStorage.write(db);
                this.closeModal('modal-medicine');
                alert("Inventory changes updated successfully.");
            }

            static viewVendorNetwork() {
                const db = SystemStorage.read();
                const container = document.getElementById('vendor-network-list');
                if(!container) return;

                if(!db.suppliers || db.suppliers.length === 0) {
                    container.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500 font-medium text-center">No active vendor connections mapped in storage fields.</div>`;
                    this.openModal('modal-vendors');
                    return;
                }

                container.innerHTML = db.suppliers.map((s, idx) => `
                    <div class="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-xs font-medium">
                        <div class="text-left">
                            <div class="text-sm font-bold text-slate-800">${s.name}</div>
                            <div class="text-xs text-slate-400 mt-0.5 font-semibold">Address: ${s.contact || 'Not logged'} | Mobile: ${s.phone}</div>
                        </div>
                        <div class="flex items-center gap-1">
                            <button onclick="UI.editVendorRecord(${idx})" class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="UI.deleteVendorRecord(${idx})" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                `).join('');
                this.openModal('modal-vendors');
            }

            static openAddVendorFromNetwork() {
                document.getElementById('form-supplier').reset();
                document.getElementById('s-edit-index').value = "";
                document.getElementById('supplier-modal-title').innerText = "Add New Vendor Pipeline";
                document.getElementById('supplier-submit-text').innerText = "Commit Vendor Profile";
                this.openModal('modal-supplier');
            }

            static editVendorRecord(index) {
                const db = SystemStorage.read();
                const s = db.suppliers[index];
                if(!s) return;

                this.openAddVendorFromNetwork();
                document.getElementById('s-edit-index').value = index;
                document.getElementById('s-name').value = s.name;
                document.getElementById('s-contact').value = s.contact || '';
                document.getElementById('s-phone').value = s.phone;

                document.getElementById('supplier-modal-title').innerText = "Modify Supplier Profile Context";
                document.getElementById('supplier-submit-text').innerText = "Apply Context Modifications";
            }

            static deleteVendorRecord(index) {
                if(confirm("Confirm action: Sever connection profiles with this pharmaceutical broker? Linked catalog indices remain intact.")) {
                    const db = SystemStorage.read();
                    db.suppliers.splice(index, 1);
                    SystemStorage.write(db);
                    this.viewVendorNetwork();
                }
            }

            static handleSupplierSubmit(e) {
                e.preventDefault();
                const db = SystemStorage.read();
                const idxStr = document.getElementById('s-edit-index').value;

                const payload = {
                    name: document.getElementById('s-name').value.trim(),
                    contact: document.getElementById('s-contact').value.trim(),
                    phone: document.getElementById('s-phone').value.trim()
                };

                if(idxStr !== "") {
                    const idx = parseInt(idxStr);
                    if(db.suppliers[idx]) db.suppliers[idx] = payload;
                } else {
                    if(!db.suppliers) db.suppliers = [];
                    db.suppliers.push(payload);
                }

                SystemStorage.write(db);
                this.closeModal('modal-supplier');
                this.viewVendorNetwork();
                alert("Supplier pipeline directory synchronized successfully.");
            }

            static renderFinanceLedgerGrid(db) {
                const container = document.getElementById('finance-ledger-body');
                if(!container) return;
                container.innerHTML = "";

                const timeframe = document.getElementById('dashboard-timeframe')?.value || 'TODAY';
                const filtered = db.finance.filter(f => this.isDateInTimeframe(f.date, timeframe));
                
                let grossIn = filtered.filter(f => f.type === "INFLOW").reduce((a,c) => a+c.amount, 0);
                let grossOut = filtered.filter(f => f.type === "OUTFLOW").reduce((a,c) => a+c.amount, 0);

                document.getElementById('fin-gross-in').innerText = `+₹${grossIn.toLocaleString('en-IN', {minimumFractionDigits:2})}`;
                document.getElementById('fin-gross-out').innerText = `-₹${grossOut.toLocaleString('en-IN', {minimumFractionDigits:2})}`;
                document.getElementById('fin-net-profit').innerText = `₹${(grossIn - grossOut).toLocaleString('en-IN', {minimumFractionDigits:2})}`;

                const sorted = [...filtered].sort((a,b) => this.parseIndianDate(b.date) - this.parseIndianDate(a.date));

                if(sorted.length === 0) {
                    container.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 italic font-medium">No ledger audit lines located inside this timeframe.</td></tr>`;
                    return;
                }

                sorted.forEach((f, index) => {
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-100 hover:bg-slate-50/50 text-slate-600 font-semibold font-mono";
                    tr.innerHTML = `
                        <td class="p-3 text-slate-500 text-[11px]">${f.date}</td>
                        <td class="p-3 font-sans text-slate-700 text-xs font-bold">${f.category}</td>
                        <td class="p-3 text-slate-400 text-[11px]">${f.ref}</td>
                        <td class="p-3 text-right text-xs ${f.type === 'INFLOW' ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}">${f.type === 'INFLOW' ? '+' : '-'}₹${Number(f.amount).toFixed(2)}</td>
                        <td class="p-3 text-right font-sans"><button onclick="UI.deleteFinanceLine(${index})" class="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer text-xs"><i class="fa-solid fa-trash-can"></i></button></td>
                    `;
                    container.appendChild(tr);
                });
            }

            static deleteFinanceLine(idx) {
                if(confirm("Confirm reversal: Rollback this operational transaction sequence completely? Balance metrics recalculate immediately.")) {
                    const db = SystemStorage.read();
                    db.finance.splice(idx, 1);
                    SystemStorage.write(db);
                }
            }

            static handleExpenseSubmit(e) {
                e.preventDefault();
                const db = SystemStorage.read();

                db.finance.push({
                    type: "OUTFLOW",
                    category: document.getElementById('e-category').value,
                    ref: document.getElementById('e-notes').value.trim() || 'Internal Overhead Posting',
                    amount: parseFloat(document.getElementById('e-amount').value) || 0,
                    date: new Date().toLocaleDateString('en-IN')
                });

                SystemStorage.write(db);
                this.closeModal('modal-expense');
                document.getElementById('form-expense').reset();
                alert("Expense vector registered successfully into target metrics ledger.");
            }

            static syncBillingDropdowns(db) {
                const select = document.getElementById('bill-patient-id');
                if (select) {
                    select.innerHTML = db.patients.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');
                }
                
                const codeInput = document.getElementById('bill-invoice-num');
                if (codeInput && !codeInput.value) {
                    codeInput.value = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
                }
            }

            static renderUPIQR() {
                const mode = document.getElementById('bill-payment-mode').value;
                const amt = parseFloat(document.getElementById('bill-amount').value) || 0;
                const upiId = document.getElementById('clinic-upi-id').value.trim();
                
                const qrContainer = document.getElementById('upi-qr-container');
                const qrPlaceholder = document.getElementById('qr-placeholder');
                const qrDiv = document.getElementById('qrcode');
                const displayAmount = document.getElementById('qr-amount-display');

                if(mode === 'UPI' && amt > 0 && upiId) {
                    qrPlaceholder.classList.add('hidden');
                    qrContainer.classList.remove('hidden');
                    displayAmount.innerText = amt.toFixed(2);
                    qrDiv.innerHTML = "";
                    
                    const upiString = `upi://pay?pa=${upiId}&pn=CareSuite%20Clinic&am=${amt.toFixed(2)}&cu=INR`;
                    if(typeof QRCode !== 'undefined') {
                        this.qrCodeInstance = new QRCode(qrDiv, {
                            text: upiString,
                            width: 200,
                            height: 200,
                            colorDark : "#0f172a",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.H
                        });
                    }
                } else {
                    qrContainer.classList.add('hidden');
                    qrPlaceholder.classList.remove('hidden');
                }
            }

            static commitInvoiceTransaction() {
                const patientSelect = document.getElementById('bill-patient-id');
                const amtInput = document.getElementById('bill-amount');
                const modeSelect = document.getElementById('bill-payment-mode');
                const invCode = document.getElementById('bill-invoice-num').value;

                const amt = parseFloat(amtInput.value);
                if(!patientSelect.value || isNaN(amt) || amt <= 0) {
                    alert("Please provide valid invoice parameter values before committing logs.");
                    return;
                }

                const db = SystemStorage.read();
                const targetPatient = db.patients.find(p => p.id === patientSelect.value);

                if(modeSelect.value === 'Credit') {
                    if(!db.credits) db.credits = [];
                    db.credits.push({
                        id: `CRD-${Math.floor(10000 + Math.random() * 90000)}`,
                        patientId: targetPatient.id,
                        patientName: targetPatient.name,
                        ref: invCode,
                        totalAmount: amt,
                        paidAmount: 0,
                        date: new Date().toLocaleDateString('en-IN')
                    });
                } else {
                    db.finance.push({
                        type: "INFLOW",
                        category: `General Clinic Services / Billing [${modeSelect.value}]`,
                        ref: invCode,
                        amount: amt,
                        date: new Date().toLocaleDateString('en-IN')
                    });
                }

                SystemStorage.write(db);
                
                amtInput.value = "";
                document.getElementById('bill-invoice-num').value = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
                this.renderUPIQR();
                
                alert(`Invoice record committed successfully (Transaction ID: ${invCode}). balances modified.`);
                this.routeToTab('dashboard');
            }

            static handlePatientSubmit(e) {
                e.preventDefault();
                const db = SystemStorage.read();
                
                const newId = `PT-${Math.floor(9000 + Math.random() * 999)}`;
                const payload = {
                    id: newId,
                    name: document.getElementById('p-name').value.trim(),
                    mobile: document.getElementById('p-mobile').value.trim(),
                    ageVal: parseInt(document.getElementById('p-age-val').value) || 0,
                    ageUnit: document.getElementById('p-age-unit').value,
                    weight: parseFloat(document.getElementById('p-weight').value) || null,
                    address: document.getElementById('p-address').value.trim(),
                    allergies: document.getElementById('p-allergies').value.trim()
                };

                db.patients.push(payload);
                SystemStorage.write(db);
                
                this.closeModal('modal-patient');
                document.getElementById('form-patient').reset();
                alert(`Patient registration committed safely (System Reference: ${newId}).`);
            }

            static initiateVisitModal(patientId) {
                document.getElementById('form-visit').reset();
                document.getElementById('v-patient-id').value = patientId;
                document.getElementById('v-prescription').value = "";
                document.getElementById('v-treatment-plan').value = "";
                document.getElementById('v-treatment-qty').value = "";
                
                this.toggleRBS();
                this.toggleTreatment();
                this.populateVisitMedicineOptions();
                this.handlePrescriptionMedicineChange(); 
                this.pendingStockDeductions = [];

                this.openModal('modal-visit');
            }

            static toggleRBS() {
                const chk = document.getElementById('v-rbs-check');
                const input = document.getElementById('v-rbs');
                if(!chk || !input) return;
                
                if(chk.checked) {
                    input.classList.remove('hidden');
                    input.setAttribute('required', 'true');
                    input.classList.remove('bg-slate-100');
                    input.classList.add('bg-white');
                } else {
                    input.classList.add('hidden');
                    input.removeAttribute('required');
                    input.value = "";
                }
            }

            static toggleTreatment() {
                const type = document.getElementById('v-treatment-type').value;
                const container = document.getElementById('treatment-container');
                if(container) {
                    if(type !== 'None') container.classList.remove('hidden');
                    else container.classList.add('hidden');
                }
            }

            static addTreatmentToPrescription() {
                const medSelect = document.getElementById('v-treatment-medicine');
                const qtyInput = document.getElementById('v-treatment-qty');
                const planArea = document.getElementById('v-treatment-plan');

                if(!medSelect.value || !qtyInput.value) {
                    alert("Please map both target stock parameters and volume counts first.");
                    return;
                }

                const line = `[Stat Administered] ${medSelect.value} -- Vol/Dose: ${qtyInput.value}`;
                planArea.value = planArea.value ? planArea.value + "\n" + line : line;
                
                this.pendingStockDeductions.push({ name: medSelect.value, qty: 1 });
                
                medSelect.selectedIndex = 0;
                qtyInput.value = "";
            }

            static addMedicineToPrescription() {
                const medSelect = document.getElementById('v-medicine');
                const doseSelect = document.getElementById('v-dose');
                const mealSelect = document.getElementById('v-meal');
                const durInput = document.getElementById('v-duration');
                const rxArea = document.getElementById('v-prescription');
                const mlInput = document.getElementById('v-ml-input');

                if(!medSelect.value) {
                    alert("Please select a target compound parameter from localized stock selectors.");
                    return;
                }

                const medOption = medSelect.options[medSelect.selectedIndex];
                const isVial = medOption.dataset.type === 'Vial';
                const unitQty = parseFloat(medOption.dataset.unitqty) || 1;
                
                let line = "";
                let calculatedUnits = 10;
                const durMatch = (durInput.value || '').match(/\d+/);
                const days = durMatch ? (parseInt(durMatch[0]) || 1) : 1;
                let dailyCount = 2;
                if(doseSelect.value === '1-1-1') dailyCount = 3;
                if(['1-0-0','0-1-0','0-0-1'].includes(doseSelect.value)) dailyCount = 1;

                if(isVial) {
                    const mlDose = parseFloat(mlInput.value) || 0;
                    if(mlDose <= 0) {
                        alert("Please enter a valid Dose (ML) for this Vial prescription.");
                        return;
                    }
                    line = `${medSelect.value} -- ${mlDose} ML per dose -- ${doseSelect.value} -- ${mealSelect.value} -- ${durInput.value || 'As directed'}`;
                    const totalMLNeeded = mlDose * dailyCount * days;
                    calculatedUnits = totalMLNeeded / unitQty; 
                } else {
                    line = `${medSelect.value} -- ${doseSelect.value} -- ${mealSelect.value} -- ${durInput.value || 'As directed'}`;
                    calculatedUnits = days * dailyCount;
                }

                rxArea.value = rxArea.value ? rxArea.value + "\n" + line : line;
                
                this.pendingStockDeductions.push({ name: medSelect.value, qty: calculatedUnits });

                medSelect.selectedIndex = 0;
                durInput.value = "";
                mlInput.value = "";
                this.handlePrescriptionMedicineChange(); 
            }

            static handleVisitSubmit(e) {
                e.preventDefault();
                const db = SystemStorage.read();
                const pId = document.getElementById('v-patient-id').value;

                const visitPayload = {
                    id: `VST-${Math.floor(10000 + Math.random() * 90000)}`,
                    patientId: pId,
                    date: new Date().toLocaleDateString('en-IN'),
                    complaint: document.getElementById('v-complaint').value.trim(),
                    diagnosis: document.getElementById('v-diagnosis').value.trim(),
                    vitals: {
                        bp: document.getElementById('v-bp').value.trim(),
                        pulse: document.getElementById('v-pulse').value.trim(),
                        spo2: document.getElementById('v-spo2').value.trim(),
                        rbs: document.getElementById('v-rbs-check').checked ? document.getElementById('v-rbs').value.trim() : ""
                    },
                    treatmentType: document.getElementById('v-treatment-type').value,
                    treatmentPlan: document.getElementById('v-treatment-plan').value.trim(),
                    prescription: document.getElementById('v-prescription').value.trim()
                };

                // Apply structural deductions to stock cache layers
                this.pendingStockDeductions.forEach(deduction => {
                    const invItem = db.inventory.find(i => i.name === deduction.name);
                    if(invItem) {
                        invItem.qty = Math.max(0, invItem.qty - deduction.qty);
                    }
                });

                db.visits.push(visitPayload);
                SystemStorage.write(db);

                this.closeModal('modal-visit');
                alert("Clinical prescription block locked and recorded safely.");
            }

            static editLatestPrescription(patientId) {
                const db = SystemStorage.read();
                const visits = db.visits.filter(v => v.patientId === patientId);
                if(!visits.length) {
                    alert("No localized clinical files are linked to this record yet.");
                    return;
                }
                const latest = visits[visits.length - 1];
                
                this.initiateVisitModal(patientId);
                
                document.getElementById('v-complaint').value = latest.complaint || '';
                document.getElementById('v-diagnosis').value = latest.diagnosis || '';
                document.getElementById('v-bp').value = latest.vitals?.bp || '';
                document.getElementById('v-pulse').value = latest.vitals?.pulse || '';
                document.getElementById('v-spo2').value = latest.vitals?.spo2 || '';
                
                if(latest.vitals?.rbs) {
                    document.getElementById('v-rbs-check').checked = true;
                    this.toggleRBS();
                    document.getElementById('v-rbs').value = latest.vitals.rbs;
                }

                document.getElementById('v-treatment-type').value = latest.treatmentType || 'None';
                this.toggleTreatment();
                document.getElementById('v-treatment-plan').value = latest.treatmentPlan || '';
                document.getElementById('v-prescription').value = latest.prescription || '';
                
                // Pop the last element off to overwrite seamlessly on submission
                db.visits.pop();
                SystemStorage.write(db);
            }

            static renderAnalyticsMatrixCharts(revenue, expenses) {
                const ctx = document.getElementById('chart-revenue');
                if(!ctx) return;

                if (this.activeCharts['revenue']) {
                    this.activeCharts['revenue'].destroy();
                }

                this.activeCharts['revenue'] = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['Inbound Operational Fees', 'Overhead Expenses Drain'],
                        datasets: [{
                            data: [revenue, expenses],
                            backgroundColor: ['rgba(13, 148, 136, 0.85)', 'rgba(244, 63, 94, 0.85)'],
                            borderColor: ['rgb(13, 148, 136)', 'rgb(244, 63, 94)'],
                            borderWidth: 1.5,
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
                    }
                });
            }

            static renderDashboardRecentPatients(db, filteredVisits) {
                const container = document.getElementById('dash-recent-patients');
                if(!container) return;
                container.innerHTML = "";

                const sortedVisits = [...filteredVisits].sort((a,b) => this.parseIndianDate(b.date) - this.parseIndianDate(a.date)).slice(0, 5);

                if(sortedVisits.length === 0) {
                    container.innerHTML = `<div class="text-xs text-slate-400 italic py-4 font-medium text-center">No client logs mapped inside this chronological frame.</div>`;
                    return;
                }

                sortedVisits.forEach(v => {
                    const patient = db.patients.find(p => p.id === v.patientId) || { name: "Unknown Case" };
                    const item = document.createElement('div');
                    item.className = "flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100/50 transition-all text-xs";
                    item.innerHTML = `
                        <div class="text-left">
                            <div class="font-bold text-slate-800 text-sm">${patient.name}</div>
                            <div class="text-slate-400 mt-0.5 font-semibold">Diagnosis: ${v.diagnosis}</div>
                        </div>
                        <div class="text-right font-medium">
                            <span class="text-teal-700 font-bold block">${v.date}</span>
                            <button onclick="UI.exportPatientPrescriptionPDF('${v.patientId}')" class="text-[10px] text-slate-500 hover:text-teal-700 underline font-bold transition-colors cursor-pointer mt-0.5">PDF Sheet</button>
                        </div>
                    `;
                    container.appendChild(item);
                });
            }
        }

        // Initialize Runtime Sequence on View Ready State
        window.addEventListener('DOMContentLoaded', () => UI.initializeApplicationRuntime());
    