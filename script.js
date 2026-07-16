
        // =========================================================================
        // 1. SUPABASE CLOUD SETUP (AHIYA TAMARI DETAILS NAKHO)
        // =========================================================================
        const supabaseUrl = 'https://mhquthxfsjnakymtaizp.supabase.co'; 
        const supabaseKey = 'sb_publishable_S_GEAd5Y35gqI0Dgz0XNEQ_VNKimiUY';
        
        // BUG FIX: Variable nu naam 'supabase' thi badli ne 'supabaseApp' kari didhu
        const supabaseApp = supabase.createClient(supabaseUrl, supabaseKey);
        
        let currentUser = null; 

        class SystemStorage {
            static cache = {
                patients: [], visits: [], inventory: [], finance: [], credits: [], suppliers: [], clinicProfile: {}
            };

            static read() {
                return this.cache;
            }

            static async syncFromCloud() {
                if (!currentUser) return;
                
                try {
                    const [pts, vsts, inv, fin, crd, sup, prof] = await Promise.all([
                        supabaseApp.from('patients').select('*'),
                        supabaseApp.from('visits').select('*'),
                        supabaseApp.from('inventory').select('*'),
                        supabaseApp.from('finance').select('*'),
                        supabaseApp.from('credits').select('*'),
                        supabaseApp.from('suppliers').select('*'),
                        supabaseApp.from('clinic_profile').select('*').single()
                    ]);
                    
                    this.cache.patients = pts.data || [];
                    this.cache.visits = vsts.data || [];
                    this.cache.inventory = inv.data || [];
                    this.cache.finance = fin.data || [];
                    this.cache.credits = crd.data || [];
                    this.cache.suppliers = sup.data || [];
                    this.cache.clinicProfile = prof.data || { name: '', address: '', mobile: '', regno: '', doctor: '' };
                    
                    UI.triggerGlobalAuditRefresh(); 
                } catch (e) {
                    console.error("Cloud fetch failed", e);
                }
            }
        }

        class UI {
            static activeCharts = {};
            static otcCart = []; 

            static async loginClinic() {
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;
                const { data, error } = await supabaseApp.auth.signInWithPassword({ email, password });
                
                if (error) {
                    alert("Login Failed: " + error.message);
                } else {
                    currentUser = data.user;
                    document.getElementById('auth-overlay').classList.add('hidden');
                    document.getElementById('sidebar').classList.remove('hidden');
                    document.getElementById('sidebar').classList.add('flex');
                    document.getElementById('main-content').style.display = 'block';
                    await SystemStorage.syncFromCloud();
                }
            }

            static async registerClinic() {
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;
                const { data, error } = await supabaseApp.auth.signUp({ email, password });
                
                if (error) {
                    alert("Registration Failed: " + error.message);
                } else {
                    alert("Registration Successful! Welcome to MediPilot Cloud.");
                    currentUser = data.user;
                    document.getElementById('auth-overlay').classList.add('hidden');
                    document.getElementById('sidebar').classList.remove('hidden');
                    document.getElementById('sidebar').classList.add('flex');
                    document.getElementById('main-content').style.display = 'block';
                    await SystemStorage.syncFromCloud();
                }
            }

            static async logoutClinic() {
                await supabaseApp.auth.signOut();
                location.reload(); 
            }

            static async saveClinicProfile() {
                const payload = {
                    clinic_id: currentUser.id,
                    name: document.getElementById('clinic-name')?.value.trim() || '',
                    address: document.getElementById('clinic-address')?.value.trim() || '',
                    mobile: document.getElementById('clinic-mobile')?.value.trim() || '',
                    regno: document.getElementById('clinic-regno')?.value.trim() || '',
                    doctor: document.getElementById('clinic-doctor')?.value.trim() || ''
                };
                
                const { error } = await supabaseApp.from('clinic_profile').upsert(payload, { onConflict: 'clinic_id' });
                if(error) alert("Error saving profile: " + error.message);
                else {
                    alert('Clinic details saved to Cloud successfully.');
                    await SystemStorage.syncFromCloud();
                }
            }

            static async handlePatientSubmit(e) {
                e.preventDefault();
                const newId = `PT-${Math.floor(9000 + Math.random() * 999)}`;
                const payload = {
                    id: newId,
                    clinic_id: currentUser.id,
                    name: document.getElementById('p-name').value.trim(),
                    mobile: document.getElementById('p-mobile').value.trim(),
                    ageVal: parseInt(document.getElementById('p-age-val').value) || 0,
                    ageUnit: document.getElementById('p-age-unit').value,
                    weight: parseFloat(document.getElementById('p-weight').value) || null,
                    address: document.getElementById('p-address').value.trim(),
                    allergies: document.getElementById('p-allergies').value.trim()
                };

                const { error } = await supabaseApp.from('patients').insert([payload]);
                if (error) { alert("Database Error: " + error.message); return; }
                
                await SystemStorage.syncFromCloud(); 
                alert(`Patient registration committed to cloud.`);
            }

            static async deletePatientRecord(id) {
                if(confirm("Confirm action: Do you want to remove this patient file permanently from the Cloud?")) {
                    await supabaseApp.from('patients').delete().eq('id', id);
                    await supabaseApp.from('visits').delete().eq('patientId', id);
                    await SystemStorage.syncFromCloud();
                }
            }

            static async handleVisitSubmit(e) {
                e.preventDefault();
                const pId = document.getElementById('v-patient-id').value;

                const visitPayload = {
                    id: `VST-${Math.floor(10000 + Math.random() * 90000)}`,
                    clinic_id: currentUser.id,
                    patientId: pId,
                    date: new Date().toLocaleDateString('en-IN'),
                    complaint: document.getElementById('v-complaint').value.trim(),
                    diagnosis: document.getElementById('v-diagnosis').value.trim(),
                    treatmentType: document.getElementById('v-treatment-type').value,
                    treatmentPlan: document.getElementById('v-treatment-plan').value.trim(),
                    prescription: document.getElementById('v-prescription').value.trim()
                };

                const { error } = await supabaseApp.from('visits').insert([visitPayload]);
                if(error) { alert("Error: " + error.message); return; }

                await SystemStorage.syncFromCloud(); 
                alert("Clinical prescription locked in Cloud Vault.");
            }

            static async commitInvoiceTransaction() {
                const patientSelect = document.getElementById('bill-patient-id');
                const amtInput = document.getElementById('bill-amount');
                const modeSelect = document.getElementById('bill-payment-mode');
                const invCode = document.getElementById('bill-invoice-num').value;
                const amt = parseFloat(amtInput.value);

                if(!patientSelect.value || isNaN(amt) || amt <= 0) return;

                const targetPatient = SystemStorage.read().patients.find(p => p.id === patientSelect.value);

                if(modeSelect.value === 'Credit') {
                    await supabaseApp.from('credits').insert([{
                        id: `CRD-${Math.floor(10000 + Math.random() * 90000)}`,
                        clinic_id: currentUser.id,
                        patientId: targetPatient.id,
                        patientName: targetPatient.name,
                        ref: invCode,
                        totalAmount: amt,
                        paidAmount: 0,
                        date: new Date().toLocaleDateString('en-IN')
                    }]);
                } else {
                    await supabaseApp.from('finance').insert([{
                        clinic_id: currentUser.id,
                        type: "INFLOW",
                        category: `General Clinic Services [${modeSelect.value}]`,
                        ref: invCode,
                        amount: amt,
                        date: new Date().toLocaleDateString('en-IN')
                    }]);
                }

                await SystemStorage.syncFromCloud();
                amtInput.value = "";
                alert(`Invoice record committed successfully to Cloud Ledger.`);
            }

            static async receiveCreditPayment(creditId) {
                const input = document.getElementById(`pay-input-${creditId}`);
                const amount = parseFloat(input.value);
                if(isNaN(amount) || amount <= 0) return;
                
                const credit = SystemStorage.read().credits.find(c => c.id === creditId);
                const remaining = credit.totalAmount - credit.paidAmount;
                if(amount > remaining) { alert(`Exceeds balance!`); return; }
                
                await supabaseApp.from('credits').update({ paidAmount: credit.paidAmount + amount }).eq('id', creditId);
                await supabaseApp.from('finance').insert([{
                    clinic_id: currentUser.id,
                    type: "INFLOW",
                    category: "Credit Payment Settlement",
                    ref: credit.ref,
                    amount: amount,
                    date: new Date().toLocaleDateString('en-IN')
                }]);
                
                await SystemStorage.syncFromCloud();
                alert(`Success: Payment logged to cloud.`);
            }

            static async commitOTCSale() {
                const manualAmount = parseFloat(document.getElementById('otc-receive-amount').value);
                if (isNaN(manualAmount) || manualAmount <= 0) return;
                
                const mode = document.getElementById('otc-payment-mode').value;
                const refCode = `OTC-${Math.floor(100000 + Math.random() * 900000)}`;

                await supabaseApp.from('finance').insert([{
                    clinic_id: currentUser.id,
                    type: "INFLOW",
                    category: `OTC Pharmacy [${mode}]`,
                    ref: refCode,
                    amount: manualAmount,
                    date: new Date().toLocaleDateString('en-IN')
                }]);

                await SystemStorage.syncFromCloud();
                document.getElementById('otc-receive-amount').value = "";
                alert(`OTC sale recorded securely in Cloud.`);
            }

            static async handleMedicineSubmit(e) {
                e.preventDefault();
                const editId = document.getElementById('m-edit-id')?.value;
                
                const payload = {
                    id: editId || `MED-${Math.floor(1000 + Math.random() * 9000)}`,
                    clinic_id: currentUser.id,
                    name: document.getElementById('m-name').value.trim(),
                    qty: parseFloat(document.getElementById('m-qty').value) || 0,
                    purchase: parseFloat(document.getElementById('m-purchase').value) || 0,
                    selling: parseFloat(document.getElementById('m-selling').value) || 0
                };

                await supabaseApp.from('inventory').upsert(payload, { onConflict: 'id' });
                await SystemStorage.syncFromCloud();
                alert("Inventory changes updated on Cloud server.");
            }

            static async deleteInventoryRecord(id) {
                if(confirm("Confirm item drop: Erase target batch from Cloud stock?")) {
                    await supabaseApp.from('inventory').delete().eq('id', id);
                    await SystemStorage.syncFromCloud();
                }
            }

            static async handleExpenseSubmit(e) {
                e.preventDefault();
                await supabaseApp.from('finance').insert([{
                    clinic_id: currentUser.id,
                    type: "OUTFLOW",
                    category: document.getElementById('e-category').value,
                    ref: document.getElementById('e-notes').value.trim() || 'Internal Overhead Posting',
                    amount: parseFloat(document.getElementById('e-amount').value) || 0,
                    date: new Date().toLocaleDateString('en-IN')
                }]);
                
                await SystemStorage.syncFromCloud();
                alert("Expense vector registered on Cloud Ledger.");
            }

            static async deleteFinanceLine(idx) {
                if(confirm("Confirm reversal: Rollback this transaction from Cloud?")) {
                    const db = SystemStorage.read();
                    const line = db.finance.sort((a,b) => new Date(b.date) - new Date(a.date))[idx];
                    
                    if(line && line.id) {
                        await supabaseApp.from('finance').delete().eq('id', line.id);
                        await SystemStorage.syncFromCloud();
                    }
                }
            }
            
            static triggerGlobalAuditRefresh() {
               // Keeps original logic to update counts
               document.getElementById('stat-total-patients').innerText = SystemStorage.cache.patients.length;
            }

            static async initializeApplicationRuntime() {
                const { data: { session } } = await supabaseApp.auth.getSession();
                
                if (session) {
                    currentUser = session.user;
                    document.getElementById('auth-overlay').classList.add('hidden');
                    document.getElementById('sidebar').classList.remove('hidden');
                    document.getElementById('sidebar').classList.add('flex');
                    document.getElementById('main-content').style.display = 'block';
                    await SystemStorage.syncFromCloud();
                } else {
                    document.getElementById('auth-overlay').classList.remove('hidden');
                }

                // Add simple tab switching
                document.querySelectorAll('.nav-link').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const target = btn.getAttribute('data-target');
                        document.querySelectorAll('.erp-section').forEach(sec => sec.classList.add('hidden'));
                        document.getElementById(`mod-${target}`).classList.remove('hidden');
                    });
                });
            }
        }

        window.addEventListener('DOMContentLoaded', () => UI.initializeApplicationRuntime());
    