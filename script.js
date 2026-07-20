
        // =========================================================================
        // 1. SUPABASE CLOUD ENGINE (Ahiya URL ane Key nakho)
        // =========================================================================
        const supabaseUrl = 'https://mhquthxfsjnakymtaizp.supabase.co'; 
        const supabaseKey = 'sb_publishable_S_GEAd5Y35gqI0Dgz0XNEQ_VNKimiUY';
        const supabaseApp = window.supabase.createClient(supabaseUrl, supabaseKey);
        let currentUser = null;

        // LOGIN LOGIC
        async function processLogin() {
            const u = document.getElementById('login-user').value.trim();
            const p = document.getElementById('login-pass').value.trim();
            if (!u || !p) { alert('Mherbani kari Email ane Password lakho'); return; }
            
            const { data, error } = await supabaseApp.auth.signInWithPassword({ email: u, password: p });
            if (error) {
                alert("Login Failed: " + error.message);
            } else {
                currentUser = data.user;
                document.getElementById('login-overlay').classList.add('hidden');
                await SystemStorage.syncFromCloud();
            }
        }

        // REGISTER LOGIC
        async function processRegister() {
            const u = document.getElementById('login-user').value.trim();
            const p = document.getElementById('login-pass').value.trim();
            if (!u || !p) { alert('Account banavva mate Email ane Password lakho (Min 6 characters)'); return; }
            
            const { data, error } = await supabaseApp.auth.signUp({ email: u, password: p });
            if (error) {
                alert("Registration Failed: " + error.message);
            } else {
                alert("Registration Successful! Welcome to MediPilot Cloud.");
                currentUser = data.user;
                document.getElementById('login-overlay').classList.add('hidden');
                await SystemStorage.syncFromCloud();
            }
        }
        
        // LOGOUT LOGIC
        async function processLogout() {
            await supabaseApp.auth.signOut();
            window.location.reload(); 
        }

        // INIT SESSION ON LOAD
        window.addEventListener('DOMContentLoaded', async () => {
            const { data: { session } } = await supabaseApp.auth.getSession();
            if (session) {
                currentUser = session.user;
                document.getElementById('login-overlay').classList.add('hidden');
                await SystemStorage.syncFromCloud();
            }
        });

        /**
         * CLOUD VAULT SYSTEM (JSONB ENGINE)
         */
        class SystemStorage {
            static cache = null;

            static initializeEmptySchema() {
                return {
                    patients: [],
                    visits: [],
                    inventory: [],
                    finance: [],
                    credits: [],
                    suppliers: [],
                    clinicProfile: { name: '', address: '', mobile: '', regno: '', doctor: '', degree: '', esignBase64: '', estampBase64: '', esignPin: '' },
                    metadata: { initializedAt: new Date().toISOString(), softwareVersion: "2026.7.4 (Cloud Vault)" }
                };
            }

            static read() {
                if (!this.cache) {
                    this.cache = this.initializeEmptySchema();
                }
                return this.cache;
            }

            static write(payload) {
                this.cache = payload;
                UI.triggerGlobalAuditRefresh();
                
                if(currentUser) {
                    supabaseApp.from('clinic_vault').upsert({
                        clinic_id: currentUser.id,
                        data: payload
                    }, { onConflict: 'clinic_id' }).then(({error}) => {
                        if(error) console.error("Cloud Sync Error:", error);
                    });
                }
            }

            static async syncFromCloud() {
                if(!currentUser) return;
                try {
                    const { data, error } = await supabaseApp.from('clinic_vault')
                        .select('data').eq('clinic_id', currentUser.id).single();
                    
                    if (data && data.data) {
                        this.cache = data.data;
                    } else {
                        this.cache = this.initializeEmptySchema();
                        await supabaseApp.from('clinic_vault').insert([{ clinic_id: currentUser.id, data: this.cache }]);
                    }
                    UI.triggerGlobalAuditRefresh();
                } catch (e) {
                    console.error("Cloud Fetch Failed", e);
                }
            }

            static exportDatabaseVault() {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.read(), null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `MediPilot_Cloud_Vault_${new Date().toISOString().split('T')[0]}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
            }

            static importDatabaseVault() {
                alert("Aa ek Cloud system chhe, aama data auto-save thay chhe. Offline import Cloud maa bandh chhe.");
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

            static parseIndianDate(dateStr) {
                if(!dateStr) return new Date(0);
                const parts = dateStr.split(/[-/]/);
                if (parts.length === 3 && parts[2].length === 4) {
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
                return new Date(dateStr);
            }

            static renderGreeting() {
                const db = SystemStorage.read();
                const hour = new Date().getHours();
                let greeting = 'Good Evening';
                
                if (hour >= 5 && hour < 12) {
                    greeting = 'Good Morning';
                } else if (hour >= 12 && hour < 17) {
                    greeting = 'Good Afternoon';
                }
                
                let docName = db.clinicProfile?.doctor?.trim() || '';
                let finalName = "Dr.";
                
                if (docName) {
                    if (docName.toLowerCase().startsWith('dr.') || docName.toLowerCase().startsWith('dr ')) {
                        finalName = docName;
                    } else {
                        finalName = "Dr. " + docName;
                    }
                }
                
                const greetingEl = document.getElementById('dashboard-greeting');
                if (greetingEl) {
                    greetingEl.innerText = `Clinic Management System`;
                }
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

            static filterVisitMedicineOptions(selectId, filterType) {
                const select = document.getElementById(selectId);
                if(!select) return;
                
                const db = SystemStorage.read();
                const inventory = Array.isArray(db.inventory) ? [...db.inventory].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];
                
                const filtered = filterType === 'ALL' ? inventory : inventory.filter(i => i.type === filterType);
                
                const optionsHtml = '<option value="" data-type="" data-unitqty="">Select medicine from stock</option>' + 
                    filtered.map(item => `<option value="${item.name}" data-type="${item.type || ''}" data-unitqty="${item.unitQty || 1}">${item.name}</option>`).join('');
                
                select.innerHTML = optionsHtml;
                
                if (selectId === 'v-medicine') {
                    this.handlePrescriptionMedicineChange();
                }
            }

            static handlePrescriptionMedicineChange() {
                const select = document.getElementById('v-medicine');
                const mlContainer = document.getElementById('v-ml-container');
                const mlInput = document.getElementById('v-ml-input');
                const directQtyContainer = document.getElementById('v-direct-qty-container');
                const directQtyInput = document.getElementById('v-direct-qty-input');
                
                if(!select) return;
                
                const option = select.options[select.selectedIndex];
                const type = option ? option.dataset.type : '';
                
                if(mlContainer) mlContainer.classList.add('hidden');
                if(directQtyContainer) directQtyContainer.classList.add('hidden');
                
                const directQtyTypes = ['Syrup', 'Ointment', 'Drop', 'Lotion', 'Sachet', 'Nab', 'Other'];
                
                if (type === 'Vial') {
                    if(mlContainer) mlContainer.classList.remove('hidden');
                } else if (directQtyTypes.includes(type)) {
                    if(directQtyContainer) directQtyContainer.classList.remove('hidden');
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
                    'clinic-doctor': clinic.doctor || '',
                    'clinic-degree': clinic.degree || '',
                    'clinic-esign-base64': clinic.esignBase64 || '',
                    'clinic-estamp-base64': clinic.estampBase64 || '',
                    'clinic-esign-pin': clinic.esignPin || ''
                };
                Object.entries(map).forEach(([id, value]) => {
                    const el = document.getElementById(id);
                    if (el) el.value = value;
                });

                const previewSign = document.getElementById('esign-preview');
                if (previewSign) {
                    if (clinic.esignBase64) {
                        previewSign.src = clinic.esignBase64;
                        previewSign.classList.remove('hidden');
                    } else {
                        previewSign.src = '';
                        previewSign.classList.add('hidden');
                    }
                }

                const previewStamp = document.getElementById('estamp-preview');
                if (previewStamp) {
                    if (clinic.estampBase64) {
                        previewStamp.src = clinic.estampBase64;
                        previewStamp.classList.remove('hidden');
                    } else {
                        previewStamp.src = '';
                        previewStamp.classList.add('hidden');
                    }
                }
            }

            static saveClinicProfile() {
                const db = SystemStorage.read();
                db.clinicProfile = {
                    name: document.getElementById('clinic-name')?.value.trim() || '',
                    address: document.getElementById('clinic-address')?.value.trim() || '',
                    mobile: document.getElementById('clinic-mobile')?.value.trim() || '',
                    regno: document.getElementById('clinic-regno')?.value.trim() || '',
                    doctor: document.getElementById('clinic-doctor')?.value.trim() || '',
                    degree: document.getElementById('clinic-degree')?.value.trim() || '',
                    esignBase64: document.getElementById('clinic-esign-base64')?.value || '',
                    estampBase64: document.getElementById('clinic-estamp-base64')?.value || '',
                    esignPin: document.getElementById('clinic-esign-pin')?.value || ''
                };
                SystemStorage.write(db);
                alert('Clinic profile & E-Security details saved successfully.');
            }

            static getPatientExportData(patientId) {
                const db = SystemStorage.read();
                const patient = db.patients.find(p => p.id === patientId);
                const visits = db.visits.filter(v => v.patientId === patientId);
                return { clinic: db.clinicProfile || {}, patient, visits };
            }

            static buildPatientPrescriptionHTML(patientId, useEsign = false) {
                const { clinic, patient, visits } = this.getPatientExportData(patientId);
                if (!patient) return '';
                const latestVisit = visits.length ? visits[visits.length - 1] : null;
                const rxText = latestVisit?.prescription || 'No prescription saved';
                const complaint = latestVisit?.complaint || 'Not recorded';
                const diagnosis = latestVisit?.diagnosis || 'Not recorded';
                const visitDate = latestVisit?.date || new Date().toLocaleDateString('en-IN');
                
                const docDegree = clinic.degree ? ` (${clinic.degree})` : '';
                const docName = clinic.doctor ? clinic.doctor + docDegree : 'Consultant Name';

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

                let signatureHtml = `<div style="height: 70px;"></div>`; 
                let stampHtml = ``;

                if (useEsign) {
                    if (clinic.esignBase64) {
                        signatureHtml = `<img src="${clinic.esignBase64}" style="height:75px; max-width:100%; object-fit:contain; margin: 0 auto 5px auto; display:block;" />`;
                    }
                    if (clinic.estampBase64) {
                        stampHtml = `<img src="${clinic.estampBase64}" style="height:120px; max-width:100%; object-fit:contain; margin: 0 auto; display:block; opacity: 0.85;" />`;
                    }
                }

                return `
                    <div id="patient-export-sheet" style="font-family:'Arial',sans-serif;background:#ffffff;color:#0f172a;width:100%;box-sizing:border-box;">
                        <div style="border:2px solid #0f766e;border-radius:14px;overflow:hidden;box-sizing:border-box;width:100%;">
                            <div style="padding:18px 22px;border-bottom:3px solid #0f766e;text-align:center;background:#f0fdfa;">
                                <div style="font-size:28px;font-weight:800;letter-spacing:.3px;color:#0f766e;text-transform:uppercase;">${clinic.name || 'Clinic Name'}</div>
                                <div style="font-size:13px;color:#334155;margin-top:6px;">${clinic.address || 'Clinic Address'}</div>
                                <div style="font-size:13px;color:#334155;margin-top:4px;">Consultant: ${docName} | Reg. No.: ${clinic.regno || 'Not set'} | Contact: ${clinic.mobile || 'Not set'}</div>
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
                                
                                <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:35px;">
                                    <div style="font-size:11px;color:#64748b;max-width:30%;">This prescription is generated from clinic records via MediPilot. Please review medicines before printing.</div>
                                    
                                    <div style="flex:1;text-align:center; display:flex; justify-content:center; align-items:flex-end;">
                                        ${stampHtml}
                                    </div>

                                    <div style="min-width:210px;text-align:center;">
                                        ${signatureHtml}
                                        <div style="border-top:1px solid #334155;padding-top:8px;font-size:13px;font-weight:700;color:#0f172a;">${docName}</div>
                                        <div style="font-size:12px;color:#64748b;">Authorized Signatory</div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                `;
            }

            static printPatientPrescription(patientId) {
                const db = SystemStorage.read();
                const clinic = db.clinicProfile || {};
                let useEsign = false;
                
                if ((clinic.esignBase64 || clinic.estampBase64) && clinic.esignPin) {
                    const pin = prompt("Enter Security Passcode to attach E-Sign & Stamp (Leave blank to print normally):");
                    if (pin !== null && pin !== "") {
                        if (pin === clinic.esignPin) {
                            useEsign = true;
                        } else {
                            alert("Incorrect Passcode! Printing without signature/stamp.");
                        }
                    }
                }

                const html = this.buildPatientPrescriptionHTML(patientId, useEsign);
                if (!html) return;
                const printArea = document.getElementById('print-area');
                printArea.innerHTML = html;
                window.print();
            }

            static exportPatientPrescriptionPDF(patientId) {
                const { patient } = this.getPatientExportData(patientId);
                if (!patient) return;
                
                const db = SystemStorage.read();
                const clinic = db.clinicProfile || {};
                let useEsign = false;
                
                if ((clinic.esignBase64 || clinic.estampBase64) && clinic.esignPin) {
                    const pin = prompt("Enter Security Passcode to attach E-Sign & Stamp (Leave blank to generate normally):");
                    if (pin !== null && pin !== "") {
                        if (pin === clinic.esignPin) {
                            useEsign = true;
                        } else {
                            alert("Incorrect Passcode! Generating PDF without signature/stamp.");
                        }
                    }
                }

                const html = this.buildPatientPrescriptionHTML(patientId, useEsign);
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
                const db = SystemStorage.read();
                const { clinic, patient } = this.getPatientExportData(patientId);
                if (!patient) return;
                
                let useEsign = false;
                if ((clinic.esignBase64 || clinic.estampBase64) && clinic.esignPin) {
                    const pin = prompt("Enter Security Passcode to attach E-Sign & Stamp for WhatsApp PDF (Leave blank for normal PDF):");
                    if (pin !== null && pin !== "") {
                        if (pin === clinic.esignPin) {
                            useEsign = true;
                        } else {
                            alert("Incorrect Passcode! Generating PDF without signature/stamp.");
                        }
                    }
                }

                const html = this.buildPatientPrescriptionHTML(patientId, useEsign);
                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                const node = wrapper.firstElementChild;
                document.body.appendChild(node);
                
                const fileName = `${patient.name.replace(/\s+/g, '_')}_prescription.pdf`;
                const opt = {
                    margin: 0.3,
                    filename: fileName,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
                };

                const msgText = `Hello ${patient.name},\nHere is your prescription from ${clinic.name || 'our clinic'}. Please find the attached PDF document.`;
                let mobileNum = patient.mobile ? patient.mobile.replace(/\D/g, '') : '';
                if(mobileNum.length === 10) mobileNum = '91' + mobileNum; // Add India country code automatically if 10 digits

                html2pdf().set(opt).from(node).toPdf().get('pdf').then(function(pdf) {
                    const pdfBlob = pdf.output('blob');
                    node.remove(); // Cleanup DOM
                    
                    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
                    
                    // Web Share API (Works natively on Mobile Devices)
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        navigator.share({
                            files: [file],
                            title: 'Prescription PDF',
                            text: msgText
                        }).catch(err => console.log('Share error:', err));
                    } else {
                        // Desktop Fallback: Download file automatically and open WhatsApp Web
                        alert("Direct PDF sharing to WhatsApp is supported mainly on Mobile phones. The PDF will now be downloaded to your device. Please attach it manually in the WhatsApp chat.");
                        
                        const url = URL.createObjectURL(pdfBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        URL.revokeObjectURL(url);
                        
                        const waUrl = mobileNum ? `https://wa.me/${mobileNum}?text=${encodeURIComponent(msgText)}` : `https://wa.me/?text=${encodeURIComponent(msgText)}`;
                        window.open(waUrl, '_blank');
                    }
                }).catch(err => {
                    console.error('PDF Generation Error:', err);
                    if(node) node.remove();
                });
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

                // E-Sign Upload Handler
                const esignFile = document.getElementById('clinic-esign-file');
                if(esignFile) {
                    esignFile.addEventListener('change', function(e) {
                        const file = e.target.files[0];
                        if(file) {
                            const reader = new FileReader();
                            reader.onload = function(evt) {
                                document.getElementById('clinic-esign-base64').value = evt.target.result;
                                const preview = document.getElementById('esign-preview');
                                preview.src = evt.target.result;
                                preview.classList.remove('hidden');
                            };
                            reader.readAsDataURL(file);
                        }
                    });
                }

                // E-Stamp Upload Handler
                const estampFile = document.getElementById('clinic-estamp-file');
                if(estampFile) {
                    estampFile.addEventListener('change', function(e) {
                        const file = e.target.files[0];
                        if(file) {
                            const reader = new FileReader();
                            reader.onload = function(evt) {
                                document.getElementById('clinic-estamp-base64').value = evt.target.result;
                                const preview = document.getElementById('estamp-preview');
                                preview.src = evt.target.result;
                                preview.classList.remove('hidden');
                            };
                            reader.readAsDataURL(file);
                        }
                    });
                }

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

            static triggerInventoryFilter() {
                this.renderInventoryGrid(SystemStorage.read(), this.currentInventoryFilter);
            }

            static triggerGlobalAuditRefresh() {
                const db = SystemStorage.read();
                
                this.renderGreeting(); 

                const timeframe = document.getElementById('dashboard-timeframe')?.value || 'TODAY';
                
                const filteredFinance = db.finance.filter(f => this.isDateInTimeframe(f.date, timeframe));
                let totalRevenue = filteredFinance.filter(f => f.type === "INFLOW").reduce((a,c) => a+c.amount, 0);
                let totalExpenses = filteredFinance.filter(f => f.type === "OUTFLOW").reduce((a,c) => a+c.amount, 0);
                
                const filteredVisits = db.visits.filter(v => this.isDateInTimeframe(v.date, timeframe));
                const totalOPD = filteredVisits.length;

                let stockAssetValue = db.inventory.reduce((a,c) => a + (c.qty * c.selling), 0);
                let totalStockValuePTR = db.inventory.reduce((a, c) => a + (c.qty * c.purchase), 0);
                let lowStockCount = db.inventory.filter(i => i.qty <= 15).length;
                let today = new Date();
                let sixMonthsHence = new Date(today.getTime() + (180 * 24 * 60 * 60 * 1000));
                let nearExpiryCount = db.inventory.filter(i => {
                    let expDate = new Date(i.expiry + "-01");
                    return expDate >= today && expDate <= sixMonthsHence;
                }).length;

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
                        <td class="p-4 align-middle">
                            <div class="flex justify-center items-center gap-1.5 flex-wrap">
                                <button onclick="UI.initiateVisitModal('${p.id}')" title="Clinical Notes" class="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-notes-medical"></i></button>
                                <button onclick="UI.editLatestPrescription('${p.id}')" title="Edit Prescription" class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-pen-to-square"></i></button>
                                <button onclick="UI.sharePatientPrescriptionWhatsApp('${p.id}')" title="Share WhatsApp" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-brands fa-whatsapp"></i></button>
                                <button onclick="UI.printPatientPrescription('${p.id}')" title="Print Prescription" class="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-print"></i></button>
                                <button onclick="UI.deletePatientRecord('${p.id}')" title="Delete Profile" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
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

            // NEW FUNCTION: Print Inventory Stock
            static printInventoryStock() {
                const db = SystemStorage.read();
                let datasets = db.inventory;
                
                // Apply active filters so only shown items are printed
                if (this.currentInventoryFilter === 'LOW_STOCK') {
                    datasets = datasets.filter(i => i.qty <= 15);
                } else if (this.currentInventoryFilter === 'NEAR_EXPIRY') {
                    let today = new Date();
                    let sixMonthsHence = new Date(today.getTime() + (180 * 24 * 60 * 60 * 1000));
                    datasets = datasets.filter(i => {
                        let expDate = new Date(i.expiry + "-01");
                        return expDate >= today && expDate <= sixMonthsHence;
                    });
                }

                const searchInput = document.getElementById('inventory-search');
                if (searchInput) {
                    const searchTerm = searchInput.value.toLowerCase().trim();
                    if (searchTerm) {
                        datasets = datasets.filter(i => 
                            (i.name && i.name.toLowerCase().includes(searchTerm)) || 
                            (i.supplier && i.supplier.toLowerCase().includes(searchTerm))
                        );
                    }
                }

                const typeFilter = document.getElementById('inventory-type-filter');
                if (typeFilter && typeFilter.value !== 'ALL') {
                    datasets = datasets.filter(i => i.type === typeFilter.value);
                }

                const clinic = db.clinicProfile || {};
                const printDate = new Date().toLocaleDateString('en-IN') + ' ' + new Date().toLocaleTimeString('en-IN');

                let html = `
                    <div style="font-family:'Arial',sans-serif;background:#ffffff;color:#0f172a;width:100%;box-sizing:border-box;padding:20px;">
                        <div style="text-align:center; margin-bottom: 20px; border-bottom: 2px solid #0f766e; padding-bottom: 10px;">
                            <h2 style="margin:0; font-size: 24px; color: #0f766e; text-transform: uppercase; font-weight:800;">${clinic.name || 'Clinic Stock Report'}</h2>
                            <p style="margin:5px 0 0; font-size: 13px; color: #475569;">${clinic.address || ''}</p>
                            <p style="margin:8px 0 0; font-size: 15px; font-weight: bold; color:#0f172a;">Current Stock Inventory Ledger</p>
                            <p style="margin:4px 0 0; font-size: 11px; color: #64748b;">Generated on: ${printDate}</p>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                            <thead>
                                <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">Sr No.</th>
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">Medicine Name</th>
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">Type</th>
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">Supplier</th>
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">Expiry Date</th>
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">Qty (Units)</th>
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">PTR (₹)</th>
                                    <th style="padding: 10px 8px; border: 1px solid #e2e8f0; color:#334155;">MRP (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                if (datasets.length === 0) {
                    html += `<tr><td colspan="8" style="padding: 12px; text-align: center; border: 1px solid #e2e8f0; color:#64748b; font-style: italic;">No stock records found for current filters.</td></tr>`;
                } else {
                    datasets.forEach((i, idx) => {
                        let qtyStyle = i.qty <= 0 ? 'color:#e11d48;font-weight:bold;' : (i.qty <= 15 ? 'color:#ea580c;font-weight:bold;' : 'font-weight:bold;');
                        html += `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 8px; border: 1px solid #e2e8f0;">${idx + 1}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color:#0f172a;">${i.name}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; color:#475569;">${i.type || '-'}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; color:#475569;">${i.supplier || '-'}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; color:#475569;">${i.expiry}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; ${qtyStyle}">${parseFloat(Number(i.qty).toFixed(2))}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; color:#475569;">${Number(i.purchase).toFixed(2)}</td>
                                <td style="padding: 8px; border: 1px solid #e2e8f0; color:#475569;">${Number(i.selling).toFixed(2)}</td>
                            </tr>
                        `;
                    });
                }

                html += `
                            </tbody>
                        </table>
                        <div style="margin-top: 30px; font-size: 11px; color: #94a3b8; text-align: center;">
                            Printed via MediPilot Clinic Management System
                        </div>
                    </div>
                `;

                const printArea = document.getElementById('print-area');
                printArea.innerHTML = html;
                window.print();
            }

            static exportInventoryCSV() {
                const db = SystemStorage.read();
                let csvContent = "data:text/csv;charset=utf-8,";
                csvContent += "Medicine Type,Medicine Name,Supplier,Expiry Date,Total Qty,PTR (Purchase),MRP (Selling),Stock Status\n";
                db.inventory.forEach(i => {
                    let status = (i.qty <= 0) ? "Depleted" : (i.qty <= 15 ? "Low Level" : "In Stock");
                    let row = `"${i.type || ''}","${i.name}","${i.supplier || ''}","${i.expiry}","${i.qty}","${i.purchase}","${i.selling}","${status}"`;
                    csvContent += row + "\r\n";
                });
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `MediPilot_Stock_Export_${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                link.remove();
            }

            static renderInventoryGrid(db, filter = null) {
                const container = document.getElementById('inventory-table-body');
                if(!container) return;
                container.innerHTML = "";

                let datasets = db.inventory;
                
                // Existing logic for button filters
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

                // Search by Name/Supplier
                const searchInput = document.getElementById('inventory-search');
                if (searchInput) {
                    const searchTerm = searchInput.value.toLowerCase().trim();
                    if (searchTerm) {
                        datasets = datasets.filter(i => 
                            (i.name && i.name.toLowerCase().includes(searchTerm)) || 
                            (i.supplier && i.supplier.toLowerCase().includes(searchTerm))
                        );
                    }
                }

                // Filter by Medicine Type
                const typeFilter = document.getElementById('inventory-type-filter');
                if (typeFilter && typeFilter.value !== 'ALL') {
                    datasets = datasets.filter(i => i.type === typeFilter.value);
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
                            <div class="text-[11px] text-slate-400 font-medium mt-0.5">Unit: ${i.unitType || 'Pkg'} • ${i.unitQty ? i.unitQty + ' Units/Pkg' : ''}</div>
                        </td>
                        <td class="p-4 text-slate-500 font-semibold">${i.supplier || 'N/A'}</td>
                        <td class="p-4 font-bold text-slate-700 font-mono">${i.expiry}</td>
                        <td class="p-4 text-center font-black text-slate-800">${parseFloat(Number(i.qty).toFixed(2))} total units</td>
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

            static calculateTotalQty() {
                const uQty = parseFloat(document.getElementById('m-unit-qty').value) || 1;
                const pQty = parseFloat(document.getElementById('m-qty').value) || 0;
                document.getElementById('m-total-qty').value = uQty * pQty;
            }

            static initMedicineModal() {
                document.getElementById('form-medicine').reset();
                document.getElementById('m-edit-id').value = "";
                document.getElementById('m-type-other-container').classList.add('hidden'); 
                document.getElementById('m-type-other').removeAttribute('required');

                this.populateExpiryYears(); 

                document.getElementById('medicine-modal-title').innerHTML = '<i class="fa-solid fa-pills mr-2 text-emerald-400"></i>Register New Medicine';
                document.getElementById('medicine-submit-btn').innerText = "Save & Add Medicine";
                
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
                document.getElementById('m-unit-type').value = item.unitType || 'Strip';
                document.getElementById('m-unit-qty').value = item.unitQty || 1;
                document.getElementById('m-qty').value = item.qty / (item.unitQty || 1); // Reverse calculate package volume based on current stock
                document.getElementById('m-total-qty').value = item.qty;
                
                document.getElementById('m-name').value = item.name;
                document.getElementById('m-supplier').value = item.supplier || '';
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
                    supplier: document.getElementById('m-supplier').value,
                    expiry: expiryVal,
                    unitType: document.getElementById('m-unit-type').value,
                    unitQty: parseFloat(document.getElementById('m-unit-qty').value) || 1,
                    qty: parseFloat(document.getElementById('m-total-qty').value) || 0,
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
                const pName = document.getElementById('p-name').value.trim();
                const pMobile = document.getElementById('p-mobile').value.trim();

                const payload = {
                    id: newId,
                    name: pName,
                    mobile: pMobile,
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

                // WHATSAPP WELCOME MESSAGE AUTO SEND
                const clinicName = db.clinicProfile?.name || 'our clinic';
                const msgText = `Hello ${pName},\nWelcome to ${clinicName}!\nYour Patient Registration Number is: ${newId}\nPlease keep this number safe for future visits.`;
                
                let mobileNum = pMobile.replace(/\D/g, '');
                if(mobileNum.length === 10) mobileNum = '91' + mobileNum; // auto-append India code
                
                if (mobileNum) {
                    const waUrl = `https://wa.me/${mobileNum}?text=${encodeURIComponent(msgText)}`;
                    window.open(waUrl, '_blank');
                }
            }

            static initiateVisitModal(patientId) {
                document.getElementById('form-visit').reset();
                document.getElementById('v-patient-id').value = patientId;
                document.getElementById('v-prescription').value = "";
                document.getElementById('v-treatment-plan').value = "";
                document.getElementById('v-treatment-qty').value = "";
                document.getElementById('v-stitches-count').value = "";
                
                this.toggleRBS();
                this.toggleTreatment();
                
                if(document.getElementById('v-treatment-med-type')) {
                    this.filterVisitMedicineOptions('v-treatment-medicine', document.getElementById('v-treatment-med-type').value);
                }
                if(document.getElementById('v-rx-med-type')) {
                    this.filterVisitMedicineOptions('v-medicine', document.getElementById('v-rx-med-type').value);
                }

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
                const medControls = document.getElementById('treatment-med-controls');
                const stitchesContainer = document.getElementById('stitches-container');
                
                if(container) {
                    if(type !== 'None') {
                        container.classList.remove('hidden');
                        
                        if (type === 'Stitches') {
                            if(medControls) medControls.classList.add('hidden');
                            if(stitchesContainer) stitchesContainer.classList.remove('hidden');
                        } else if (type === 'Dressing') {
                            if(medControls) medControls.classList.add('hidden');
                            if(stitchesContainer) stitchesContainer.classList.add('hidden');
                        } else {
                            if(medControls) medControls.classList.remove('hidden');
                            if(stitchesContainer) stitchesContainer.classList.add('hidden');
                        }
                    } else {
                        container.classList.add('hidden');
                    }
                }
            }

            static addTreatmentToPrescription() {
                const type = document.getElementById('v-treatment-type').value;
                let line = "";
                const planArea = document.getElementById('v-treatment-plan');

                if (type === 'Stitches') {
                    const count = document.getElementById('v-stitches-count').value;
                    if (!count) { alert("Please enter the number of stitches."); return; }
                    line = `[Stat Administered] Stitches -- Count: ${count}`;
                    document.getElementById('v-stitches-count').value = "";
                } else if (type === 'Dressing') {
                    line = `[Stat Administered] Dressing`;
                } else {
                    const medSelect = document.getElementById('v-treatment-medicine');
                    const qtyInput = document.getElementById('v-treatment-qty');
                    if(!medSelect.value || !qtyInput.value) {
                        alert("Please map both target stock parameters and volume counts first.");
                        return;
                    }
                    line = `[Stat Administered] ${medSelect.value} -- Vol/Dose: ${qtyInput.value}`;
                    this.pendingStockDeductions.push({ name: medSelect.value, qty: 1 });
                    medSelect.selectedIndex = 0;
                    qtyInput.value = "";
                }
                
                planArea.value = planArea.value ? planArea.value + "\n" + line : line;
            }

            static addMedicineToPrescription() {
                const medSelect = document.getElementById('v-medicine');
                const doseSelect = document.getElementById('v-dose');
                const mealSelect = document.getElementById('v-meal');
                const durInput = document.getElementById('v-duration');
                const rxArea = document.getElementById('v-prescription');
                const mlInput = document.getElementById('v-ml-input');
                const directQtyInput = document.getElementById('v-direct-qty-input');

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

                const directQtyTypes = ['Syrup', 'Ointment', 'Drop', 'Lotion', 'Sachet', 'Nab', 'Other'];

                if(isVial) {
                    const mlDose = parseFloat(mlInput.value) || 0;
                    if(mlDose <= 0) {
                        alert("Please enter a valid Dose (ML) for this Vial prescription.");
                        return;
                    }
                    line = `${medSelect.value} -- ${mlDose} ML per dose -- ${doseSelect.value} -- ${mealSelect.value} -- ${durInput.value || 'As directed'}`;
                    const totalMLNeeded = mlDose * dailyCount * days;
                    calculatedUnits = totalMLNeeded / unitQty; 
                } else if (directQtyTypes.includes(medOption.dataset.type)) {
                    const directQty = parseFloat(directQtyInput.value) || 0;
                    if(directQty <= 0) {
                        alert("Please enter a valid Qty Given for this medicine type.");
                        return;
                    }
                    line = `${medSelect.value} -- ${doseSelect.value} -- ${mealSelect.value} -- ${durInput.value || 'As directed'} -- [Qty Dispensed: ${directQty}]`;
                    calculatedUnits = directQty;
                } else {
                    line = `${medSelect.value} -- ${doseSelect.value} -- ${mealSelect.value} -- ${durInput.value || 'As directed'}`;
                    calculatedUnits = days * dailyCount;
                }

                rxArea.value = rxArea.value ? rxArea.value + "\n" + line : line;
                
                this.pendingStockDeductions.push({ name: medSelect.value, qty: calculatedUnits });

                medSelect.selectedIndex = 0;
                durInput.value = "";
                mlInput.value = "";
                directQtyInput.value = "";
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
                            <button onclick="UI.printPatientPrescription('${v.patientId}')" class="text-[10px] text-slate-500 hover:text-teal-700 underline font-bold transition-colors cursor-pointer mt-0.5">Print Sheet</button>
                        </div>
                    `;
                    container.appendChild(item);
                });
            }
        }

        // Initialize Runtime Sequence on View Ready State
        window.addEventListener('DOMContentLoaded', () => UI.initializeApplicationRuntime());
    