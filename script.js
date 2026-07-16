
        // =========================================================================
        // 1. SUPABASE CLOUD SETUP (AHIYA TAMARI DETAILS NAKHO)
        // =========================================================================
        const supabaseUrl = 'YOUR_SUPABASE_PROJECT_URL_HERE'; 
        const supabaseKey = 'YOUR_SUPABASE_ANON_PUBLISHABLE_KEY_HERE';
        const supabase = supabase.createClient(supabaseUrl, supabaseKey);
        
        let currentUser = null; // Stores logged-in clinic details

        /**
         * GLOBAL CONTROLLER ARCHITECTURE: SUPABASE CLOUD ENGINE
         */
        class SystemStorage {
            // Local Cache (Fast UI Rendering)
            static cache = {
                patients: [], visits: [], inventory: [], finance: [], credits: [], suppliers: [], clinicProfile: {}
            };

            // Read hamesha sync rehashe jethi tamaro aakho UI code chalto rahe
            static read() {
                return this.cache;
            }

            // Cloud mathi badho data fetch karvo
            static async syncFromCloud() {
                if (!currentUser) return;
                
                try {
                    // Ek sathe badha tables mathi data laavo (RLS mujab fakt aena j data aavshe)
                    const [pts, vsts, inv, fin, crd, sup, prof] = await Promise.all([
                        supabase.from('patients').select('*'),
                        supabase.from('visits').select('*'),
                        supabase.from('inventory').select('*'),
                        supabase.from('finance').select('*'),
                        supabase.from('credits').select('*'),
                        supabase.from('suppliers').select('*'),
                        supabase.from('clinic_profile').select('*').single()
                    ]);
                    
                    this.cache.patients = pts.data || [];
                    this.cache.visits = vsts.data || [];
                    this.cache.inventory = inv.data || [];
                    this.cache.finance = fin.data || [];
                    this.cache.credits = crd.data || [];
                    this.cache.suppliers = sup.data || [];
                    this.cache.clinicProfile = prof.data || { name: '', address: '', mobile: '', regno: '', doctor: '' };
                    
                    UI.triggerGlobalAuditRefresh(); // UI Update
                } catch (e) {
                    console.error("Cloud fetch failed", e);
                }
            }
        }

        /**
         * INTERFACE AND VIEW STATE LOGIC CONTROLLER MATRIX (UPDATED FOR CLOUD)
         */
        class UI {
            static activeCharts = {};
            static qrCodeInstance = null;
            static otcQrCodeInstance = null;
            static currentInventoryFilter = null;
            static pendingStockDeductions = [];
            static otcCart = []; 

            // --- AUTHENTICATION (SaaS Features) ---
            static async loginClinic() {
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                
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
                const { data, error } = await supabase.auth.signUp({ email, password });
                
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
                await supabase.auth.signOut();
                location.reload(); // Refresh page to show login screen
            }

            // ================= ASYNC CLOUD WRITE HANDLERS =================

            static async saveClinicProfile() {
                const payload = {
                    clinic_id: currentUser.id,
                    name: document.getElementById('clinic-name')?.value.trim() || '',
                    address: document.getElementById('clinic-address')?.value.trim() || '',
                    mobile: document.getElementById('clinic-mobile')?.value.trim() || '',
                    regno: document.getElementById('clinic-regno')?.value.trim() || '',
                    doctor: document.getElementById('clinic-doctor')?.value.trim() || ''
                };
                
                // Upsert (Update or Insert)
                const { error } = await supabase.from('clinic_profile').upsert(payload, { onConflict: 'clinic_id' });
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
                    clinic_id: currentUser.id, // RLS Ownership
                    name: document.getElementById('p-name').value.trim(),
                    mobile: document.getElementById('p-mobile').value.trim(),
                    ageVal: parseInt(document.getElementById('p-age-val').value) || 0,
                    ageUnit: document.getElementById('p-age-unit').value,
                    weight: parseFloat(document.getElementById('p-weight').value) || null,
                    address: document.getElementById('p-address').value.trim(),
                    allergies: document.getElementById('p-allergies').value.trim()
                };

                // Push to Supabase
                const { error } = await supabase.from('patients').insert([payload]);
                if (error) { alert("Database Error: " + error.message); return; }
                
                await SystemStorage.syncFromCloud(); // Re-sync local cache
                
                this.closeModal('modal-patient');
                document.getElementById('form-patient').reset();
                alert(`Patient registration committed to cloud (System Reference: ${newId}).`);
            }

            static async deletePatientRecord(id) {
                if(confirm("Confirm action: Do you want to remove this patient file permanently from the Cloud?")) {
                    await supabase.from('patients').delete().eq('id', id);
                    await supabase.from('visits').delete().eq('patientId', id); // Cascade delete visits
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
                    vitals: JSON.stringify({
                        bp: document.getElementById('v-bp').value.trim(),
                        pulse: document.getElementById('v-pulse').value.trim(),
                        spo2: document.getElementById('v-spo2').value.trim(),
                        rbs: document.getElementById('v-rbs-check').checked ? document.getElementById('v-rbs').value.trim() : ""
                    }),
                    treatmentType: document.getElementById('v-treatment-type').value,
                    treatmentPlan: document.getElementById('v-treatment-plan').value.trim(),
                    prescription: document.getElementById('v-prescription').value.trim()
                };

                // 1. Save Visit to Supabase
                const { error } = await supabase.from('visits').insert([visitPayload]);
                if(error) { alert("Error: " + error.message); return; }

                // 2. Apply Stock Deductions to Cloud Database
                for (let deduction of this.pendingStockDeductions) {
                    const db = SystemStorage.read();
                    const invItem = db.inventory.find(i => i.name === deduction.name);
                    if(invItem) {
                        const newQty = Math.max(0, invItem.qty - deduction.qty);
                        await supabase.from('inventory').update({ qty: newQty }).eq('id', invItem.id);
                    }
                }

                await SystemStorage.syncFromCloud(); // Re-sync UI
                this.closeModal('modal-visit');
                alert("Clinical prescription locked in Cloud Vault.");
            }

            static async commitInvoiceTransaction() {
                const patientSelect = document.getElementById('bill-patient-id');
                const amtInput = document.getElementById('bill-amount');
                const modeSelect = document.getElementById('bill-payment-mode');
                const invCode = document.getElementById('bill-invoice-num').value;
                const amt = parseFloat(amtInput.value);

                if(!patientSelect.value || isNaN(amt) || amt <= 0) {
                    alert("Please provide valid invoice parameter values."); return;
                }

                const targetPatient = SystemStorage.read().patients.find(p => p.id === patientSelect.value);

                if(modeSelect.value === 'Credit') {
                    await supabase.from('credits').insert([{
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
                    await supabase.from('finance').insert([{
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
                document.getElementById('bill-invoice-num').value = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
                this.renderUPIQR();
                
                alert(`Invoice record committed successfully to Cloud Ledger.`);
                this.routeToTab('dashboard');
            }

            static async receiveCreditPayment(creditId) {
                const input = document.getElementById(`pay-input-${creditId}`);
                const amount = parseFloat(input.value);
                if(isNaN(amount) || amount <= 0) return;
                
                const credit = SystemStorage.read().credits.find(c => c.id === creditId);
                const remaining = credit.totalAmount - credit.paidAmount;
                if(amount > remaining) { alert(`Exceeds balance!`); return; }
                
                // 1. Update Credit table
                await supabase.from('credits').update({ paidAmount: credit.paidAmount + amount }).eq('id', creditId);
                
                // 2. Add to Finance table
                await supabase.from('finance').insert([{
                    clinic_id: currentUser.id,
                    type: "INFLOW",
                    category: "Credit Payment Settlement",
                    ref: credit.ref,
                    amount: amount,
                    date: new Date().toLocaleDateString('en-IN')
                }]);
                
                await SystemStorage.syncFromCloud();
                this.renderCreditsList();
                alert(`Success: Payment logged to cloud.`);
            }

            static async commitOTCSale() {
                if (this.otcCart.length === 0) return;
                const manualAmount = parseFloat(document.getElementById('otc-receive-amount').value);
                if (isNaN(manualAmount) || manualAmount <= 0) return;
                
                const mode = document.getElementById('otc-payment-mode').value;
                const refCode = `OTC-${Math.floor(100000 + Math.random() * 900000)}`;

                // 1. Log Finance
                await supabase.from('finance').insert([{
                    clinic_id: currentUser.id,
                    type: "INFLOW",
                    category: `OTC Pharmacy [${mode}]`,
                    ref: refCode,
                    amount: manualAmount,
                    date: new Date().toLocaleDateString('en-IN')
                }]);

                // 2. Deduct Inventory in Cloud
                for(let cartItem of this.otcCart) {
                    const invItem = SystemStorage.read().inventory.find(i => i.id === cartItem.id);
                    if (invItem) {
                        const newQty = Math.max(0, invItem.qty - cartItem.qty);
                        await supabase.from('inventory').update({ qty: newQty }).eq('id', invItem.id);
                    }
                }
                
                await SystemStorage.syncFromCloud();
                
                this.otcCart = [];
                document.getElementById('otc-receive-amount').value = "";
                this.renderOTCCart();
                alert(`OTC sale recorded securely in Cloud (Ref: ${refCode}).`);
            }

            static async handleMedicineSubmit(e) {
                e.preventDefault();
                const editId = document.getElementById('m-edit-id').value;
                const actualType = document.getElementById('m-type').value === 'Other' ? document.getElementById('m-type-other').value.trim() : document.getElementById('m-type').value;

                const payload = {
                    id: editId || `MED-${Math.floor(1000 + Math.random() * 9000)}`,
                    clinic_id: currentUser.id,
                    type: actualType,
                    name: document.getElementById('m-name').value.trim(),
                    generic: document.getElementById('m-generic').value.trim(),
                    supplier: document.getElementById('m-supplier').value,
                    expiry: `${document.getElementById('m-expiry-year').value}-${document.getElementById('m-expiry-month').value}`,
                    unitQty: parseInt(document.getElementById('m-unit-qty').value) || 1,
                    qty: parseFloat(document.getElementById('m-qty').value) || 0,
                    purchase: parseFloat(document.getElementById('m-purchase').value) || 0,
                    selling: parseFloat(document.getElementById('m-selling').value) || 0
                };

                // Upsert (Update if exists, Insert if new)
                await supabase.from('inventory').upsert(payload, { onConflict: 'id' });
                
                await SystemStorage.syncFromCloud();
                this.closeModal('modal-medicine');
                alert("Inventory changes updated on Cloud server.");
            }

            static async deleteInventoryRecord(id) {
                if(confirm("Confirm item drop: Erase target batch from Cloud stock?")) {
                    await supabase.from('inventory').delete().eq('id', id);
                    await SystemStorage.syncFromCloud();
                }
            }

            static async handleExpenseSubmit(e) {
                e.preventDefault();
                await supabase.from('finance').insert([{
                    clinic_id: currentUser.id,
                    type: "OUTFLOW",
                    category: document.getElementById('e-category').value,
                    ref: document.getElementById('e-notes').value.trim() || 'Internal Overhead Posting',
                    amount: parseFloat(document.getElementById('e-amount').value) || 0,
                    date: new Date().toLocaleDateString('en-IN')
                }]);
                
                await SystemStorage.syncFromCloud();
                this.closeModal('modal-expense');
                document.getElementById('form-expense').reset();
                alert("Expense vector registered on Cloud Ledger.");
            }

            static async deleteFinanceLine(idx) {
                if(confirm("Confirm reversal: Rollback this transaction from Cloud?")) {
                    const db = SystemStorage.read();
                    const line = db.finance.sort((a,b) => this.parseIndianDate(b.date) - this.parseIndianDate(a.date))[idx];
                    
                    if(line && line.id) {
                        await supabase.from('finance').delete().eq('id', line.id);
                        await SystemStorage.syncFromCloud();
                    }
                }
            }
            
            // ... (Tamara baki na render functions jem ke UI.renderPatientsGrid vgere same rakhi shako cho,
            // te automatic SystemStorage.read() mathi data laishe) ...
            
            static async initializeApplicationRuntime() {
                // Check if user is already logged in via Supabase Cookies/Session
                const { data: { session } } = await supabase.auth.getSession();
                
                if (session) {
                    currentUser = session.user;
                    document.getElementById('auth-overlay').classList.add('hidden');
                    document.getElementById('sidebar').classList.remove('hidden');
                    document.getElementById('sidebar').classList.add('flex');
                    document.getElementById('main-content').style.display = 'block';
                    await SystemStorage.syncFromCloud();
                } else {
                    // Show login overlay
                    document.getElementById('auth-overlay').classList.remove('hidden');
                }

                // ... Keep your tab clicking and mobile menu code here ...
            }
        }

        window.addEventListener('DOMContentLoaded', () => UI.initializeApplicationRuntime());
    