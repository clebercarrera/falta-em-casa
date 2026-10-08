import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  getAuth
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const appRoot = document.querySelector("#app");
const toastRoot = document.querySelector("#toast");
const categories = [
  { id: "hortifruti", name: "Hortifruti", icon: "🥬" },
  { id: "mercearia", name: "Mercearia", icon: "🫙" },
  { id: "limpeza", name: "Limpeza", icon: "🧽" },
  { id: "higiene", name: "Higiene", icon: "🧴" },
  { id: "bebidas", name: "Bebidas", icon: "🥛" },
  { id: "outros", name: "Outros", icon: "🧺" }
];

let auth;
let db;
let user = null;
let family = null;
let items = [];
let members = [];
let unsubscribeItems = null;
let unsubscribeMembers = null;
let currentTab = "needed";
let currentCategory = "all";
let searchTerm = "";
let authMode = "login";
let toastTimer;

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const categoryInfo = (id) => categories.find((category) => category.id === id) || categories.at(-1);
const userName = () => user?.displayName?.trim() || user?.email?.split("@")[0] || "Pessoa da família";
const familyPath = (familyId) => `families/${familyId}`;

function showToast(message, type = "info") {
  toastRoot.textContent = message;
  toastRoot.className = `toast is-visible ${type === "error" ? "toast-error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastRoot.className = "toast"; }, 3000);
}

function showLoading(message = "Preparando a lista da casa…") {
  appRoot.innerHTML = `<div class="loading-screen"><span class="brand-mark" aria-hidden="true">＋</span><p>${escapeHtml(message)}</p></div>`;
}

function stopSubscriptions() {
  unsubscribeItems?.();
  unsubscribeMembers?.();
  unsubscribeItems = null;
  unsubscribeMembers = null;
  items = [];
  members = [];
  family = null;
}

function renderSetupNeeded() {
  appRoot.innerHTML = `
    <section class="setup-screen">
      <div class="brand-lockup"><span class="brand-mark">＋</span><span>Falta em Casa</span></div>
      <div class="setup-card">
        <span class="eyebrow">Só falta conectar</span>
        <h1>Conecte sua lista ao Firebase</h1>
        <p>Abra <code>firebase-config.js</code> e substitua os valores de exemplo pelos dados do seu app Web no Firebase Console.</p>
        <ol><li>Ative o <strong>Authentication</strong> com e-mail e senha.</li><li>Crie o banco <strong>Cloud Firestore</strong> e publique as regras do arquivo <code>firestore.rules</code>.</li><li>Recarregue esta página depois de salvar a configuração.</li></ol>
        <p class="setup-note">A configuração Web do Firebase fica visível no navegador. A proteção dos dados vem das regras do Firestore e do login.</p>
      </div>
    </section>`;
}

function renderAuth() {
  appRoot.innerHTML = `
    <section class="auth-layout">
      <div class="auth-intro">
        <div class="brand-lockup"><span class="brand-mark" aria-hidden="true">＋</span><span>Falta em Casa</span></div>
        <span class="eyebrow">A casa funciona melhor em equipe</span>
        <h1>O que acabou por aí?</h1>
        <p>Anote quando lembrar. No mercado, todo mundo já sabe o que levar.</p>
        <div class="auth-doodle" aria-hidden="true"><span>🥑</span><span>🍅</span><span>🥖</span><span>🧀</span></div>
      </div>
      <form id="auth-form" class="surface auth-card">
        <div class="form-heading"><span class="eyebrow">Sua lista, pertinho</span><h2>${authMode === "login" ? "Entrar na conta" : "Criar minha conta"}</h2><p>${authMode === "login" ? "Entre para ver a lista da família." : "Depois, crie uma lista da casa ou use um convite."}</p></div>
        ${authMode === "register" ? `<label class="field-label">Como podemos te chamar?<input name="name" type="text" autocomplete="name" maxlength="40" placeholder="Seu nome" required /></label>` : ""}
        <label class="field-label">E-mail<input name="email" type="email" autocomplete="email" inputmode="email" placeholder="voce@exemplo.com" required /></label>
        <label class="field-label">Senha<input name="password" type="password" autocomplete="${authMode === "login" ? "current-password" : "new-password"}" minlength="6" placeholder="Pelo menos 6 caracteres" required /></label>
        <button class="button button-primary button-wide" type="submit">${authMode === "login" ? "Entrar" : "Criar conta"}<span aria-hidden="true">→</span></button>
        <p class="form-switch">${authMode === "login" ? "Ainda não tem conta?" : "Já tem uma conta?"} <button class="text-button" type="button" data-action="auth-mode">${authMode === "login" ? "Criar conta" : "Fazer login"}</button></p>
        <p class="privacy-note">Sua lista é privada e compartilhada apenas com quem entrar pelo convite da família.</p>
      </form>
    </section>`;
}

function renderFamilyChoice() {
  appRoot.innerHTML = `
    <section class="onboarding-layout">
      <div class="brand-lockup"><span class="brand-mark" aria-hidden="true">＋</span><span>Falta em Casa</span></div>
      <div class="onboarding-heading"><span class="eyebrow">Oi, ${escapeHtml(userName())}!</span><h1>Vamos juntar a lista da casa?</h1><p>Crie uma família e convide todo mundo, ou entre com o código que alguém compartilhou.</p></div>
      <div class="choice-grid">
        <form id="create-family-form" class="surface choice-card">
          <span class="choice-number">01</span><h2>Começar uma lista</h2><p>Dê um nome para a casa. Você poderá convidar a família em seguida.</p>
          <label class="field-label">Nome da lista<input name="familyName" maxlength="36" placeholder="Ex.: Casa da Ana" required /></label>
          <button class="button button-primary button-wide" type="submit">Criar lista <span aria-hidden="true">→</span></button>
        </form>
        <form id="join-family-form" class="surface choice-card choice-card-soft">
          <span class="choice-number">02</span><h2>Já tenho um convite</h2><p>Digite o código de 8 letras que alguém da família enviou.</p>
          <label class="field-label">Código do convite<input name="inviteCode" class="code-input" maxlength="8" minlength="8" autocapitalize="characters" autocomplete="off" placeholder="EX.: LAR123AB" required /></label>
          <button class="button button-secondary button-wide" type="submit">Entrar na lista <span aria-hidden="true">→</span></button>
        </form>
      </div>
      <button class="signout-link" data-action="signout" type="button">Sair da conta</button>
    </section>`;
}

function renderApp() {
  if (!family) return;
  const neededCount = items.filter((item) => !item.purchased).length;
  const memberNames = members.map((member) => member.displayName).filter(Boolean);
  appRoot.innerHTML = `
    <div class="page-wrap">
      <header class="topbar">
        <a class="brand-lockup" href="./" aria-label="Falta em Casa, início"><span class="brand-mark" aria-hidden="true">＋</span><span>Falta em Casa</span></a>
        <button class="family-pill" type="button" data-action="open-family"><span class="family-avatar">${escapeHtml((family.familyName || "C").slice(0, 1).toUpperCase())}</span><span class="family-pill-copy"><strong>${escapeHtml(family.familyName)}</strong><small>${memberNames.length || 1} ${memberNames.length === 1 ? "pessoa" : "pessoas"}</small></span><span class="chevron" aria-hidden="true">⌄</span></button>
      </header>
      <main class="main-content">
        <section class="hero-copy"><div><span class="eyebrow">LISTA DA CASA</span><h1>O que está <em>faltando?</em></h1><p>Anote agora. Resolva no mercado, sem esquecer nada.</p></div><div class="hero-spark" aria-hidden="true">✳</div></section>
        <section class="quick-add surface" aria-label="Adicionar coisa à lista">
          <form id="add-item-form" class="add-form">
            <label class="visually-hidden" for="item-name">O que está faltando?</label>
            <span class="add-plus" aria-hidden="true">＋</span><input id="item-name" name="name" type="text" maxlength="80" placeholder="O que está faltando em casa?" autocomplete="off" required />
            <button class="button button-primary add-button" type="submit"><span class="desktop-add-label">Adicionar</span><span class="mobile-add-icon" aria-hidden="true">＋</span></button>
            <div class="add-options"><label><span>Quantidade</span><input name="quantity" maxlength="24" placeholder="Ex.: 2 pacotes" /></label><label><span>Categoria</span><select name="category">${categories.map((category) => `<option value="${category.id}">${category.icon} ${category.name}</option>`).join("")}</select></label></div>
          </form>
        </section>
        <section class="list-section">
          <div class="list-heading"><div><span class="eyebrow">O QUE PRECISA VIR</span><h2>Lista de compras <span class="count-badge">${neededCount}</span></h2></div><span class="live-indicator"><i></i> Compartilhada ao vivo</span></div>
          <div class="list-toolbar"><div class="tabs" role="tablist" aria-label="Itens da lista"><button class="tab ${currentTab === "needed" ? "is-active" : ""}" data-action="tab" data-tab="needed" role="tab" aria-selected="${currentTab === "needed"}">Falta comprar <span>${neededCount}</span></button><button class="tab ${currentTab === "purchased" ? "is-active" : ""}" data-action="tab" data-tab="purchased" role="tab" aria-selected="${currentTab === "purchased"}">Já peguei <span>${items.length - neededCount}</span></button></div><label class="search-box"><span aria-hidden="true">⌕</span><input id="search-items" type="search" placeholder="Buscar item" value="${escapeHtml(searchTerm)}" aria-label="Buscar item" /></label></div>
          <div class="category-row" aria-label="Filtrar por categoria"><button class="category-chip ${currentCategory === "all" ? "is-selected" : ""}" data-action="category" data-category="all">Tudo</button>${categories.map((category) => `<button class="category-chip ${currentCategory === category.id ? "is-selected" : ""}" data-action="category" data-category="${category.id}">${category.icon} ${category.name}</button>`).join("")}</div>
          <div id="items-list" class="items-list"></div>
        </section>
        <footer class="page-footer"><span>Feito junto, fica mais leve.</span><span class="footer-mark">F + C</span></footer>
      </main>
      <nav class="mobile-bottom-bar" aria-label="Atalhos"><button data-action="tab" data-tab="needed" class="${currentTab === "needed" ? "is-active" : ""}"><span>☷</span>Lista</button><button data-action="open-family"><span>⌂</span>Família</button><button data-action="signout"><span>↗</span>Sair</button></nav>
    </div>
    <div id="family-modal" class="modal-backdrop" hidden><section class="surface family-modal" role="dialog" aria-modal="true" aria-labelledby="family-modal-title"><button class="modal-close" data-action="close-family" aria-label="Fechar">×</button><span class="eyebrow">TODO MUNDO JUNTO</span><h2 id="family-modal-title">${escapeHtml(family.familyName)}</h2><p>Compartilhe este código para a família entrar na mesma lista.</p><div class="invite-code"><span>${escapeHtml(family.inviteCode || "────────")}</span><button class="button button-secondary" data-action="copy-code">Copiar</button></div><div class="member-list"><strong>Na lista</strong>${members.map((member) => `<div class="member-row"><span class="member-avatar">${escapeHtml((member.displayName || "?").slice(0, 1).toUpperCase())}</span><span>${escapeHtml(member.displayName || "Pessoa da família")}</span>${member.uid === family.ownerUid ? `<span class="owner-tag">quem criou</span>` : ""}</div>`).join("")}</div><button class="signout-link modal-signout" data-action="signout">Sair da conta</button></section></div>`;
  renderItems();
}

function renderItems() {
  const listRoot = document.querySelector("#items-list");
  if (!listRoot) return;
  const isPurchasedTab = currentTab === "purchased";
  const filtered = items
    .filter((item) => Boolean(item.purchased) === isPurchasedTab)
    .filter((item) => currentCategory === "all" || item.category === currentCategory)
    .filter((item) => `${item.name} ${item.quantity || ""}`.toLocaleLowerCase("pt-BR").includes(searchTerm.toLocaleLowerCase("pt-BR")))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  if (!filtered.length) {
    listRoot.innerHTML = `<div class="empty-state"><span class="empty-illustration" aria-hidden="true">${isPurchasedTab ? "✓" : "✳"}</span><h3>${searchTerm ? "Nada apareceu por aqui" : isPurchasedTab ? "Ainda não tem item comprado" : "Tudo em ordem por enquanto"}</h3><p>${searchTerm ? "Tente outro nome ou limpe a busca." : isPurchasedTab ? "Quando alguém marcar um item, ele aparece aqui." : "Lembrou de alguma coisa? Adicione ali em cima."}</p></div>`;
    return;
  }
  listRoot.innerHTML = filtered.map((item) => {
    const category = categoryInfo(item.category);
    return `<article class="item-row ${item.purchased ? "is-purchased" : ""}"><button class="item-check ${item.purchased ? "is-checked" : ""}" data-action="toggle-item" data-id="${escapeHtml(item.id)}" aria-label="${item.purchased ? "Desmarcar" : "Marcar como comprado"}: ${escapeHtml(item.name)}"><span>${item.purchased ? "✓" : ""}</span></button><div class="item-copy"><strong>${escapeHtml(item.name)}</strong><span>${item.quantity ? `${escapeHtml(item.quantity)} <i>·</i> ` : ""}<span class="item-category">${category.icon} ${category.name}</span></span></div><span class="added-by" title="Adicionado por ${escapeHtml(item.addedByName || "alguém da família")}">${escapeHtml((item.addedByName || "?").slice(0, 1).toUpperCase())}</span><button class="remove-item" data-action="delete-item" data-id="${escapeHtml(item.id)}" aria-label="Remover ${escapeHtml(item.name)}">×</button></article>`;
  }).join("");
}

function subscribeToFamily(familyId, familyData) {
  stopSubscriptions();
  family = { id: familyId, ...familyData };
  unsubscribeItems = onSnapshot(collection(db, familyPath(familyId), "items"), (snapshot) => {
    items = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    renderApp();
  }, (error) => showToast(`Não foi possível atualizar a lista: ${friendlyError(error)}`, "error"));
  unsubscribeMembers = onSnapshot(collection(db, familyPath(familyId), "members"), (snapshot) => {
    members = snapshot.docs.map((entry) => ({ uid: entry.id, ...entry.data() }));
    renderApp();
  }, (error) => showToast(`Não foi possível carregar a família: ${friendlyError(error)}`, "error"));
}

async function loadUserHome() {
  showLoading("Abrindo a lista da família…");
  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (!profileSnap.exists() || !profileSnap.data().familyId) {
      renderFamilyChoice();
      return;
    }
    const profile = profileSnap.data();
    const familySnap = await getDoc(doc(db, "families", profile.familyId));
    if (!familySnap.exists()) {
      renderFamilyChoice();
      return;
    }
    subscribeToFamily(profile.familyId, { ...familySnap.data(), inviteCode: profile.inviteCode });
  } catch (error) {
    showLoading("Não foi possível abrir sua lista.");
    showToast(friendlyError(error), "error");
  }
}

function makeInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint8Array(8);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha não conferem.",
    "auth/email-already-in-use": "Este e-mail já tem uma conta. Faça login.",
    "auth/weak-password": "Escolha uma senha com pelo menos 6 caracteres.",
    "auth/invalid-email": "Confira o formato do e-mail.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/network-request-failed": "Sem conexão com a internet. Verifique sua rede.",
    "permission-denied": "Acesso negado. Confira se publicou as regras de firestore.rules.",
    "unavailable": "Serviço temporariamente indisponível. Tente novamente."
  };
  return messages[error?.code] || error?.message || "Algo deu errado. Tente novamente.";
}

async function handleAuthSubmit(form) {
  const data = new FormData(form);
  const email = String(data.get("email")).trim();
  const password = String(data.get("password"));
  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;
  try {
    if (authMode === "register") {
      const name = String(data.get("name")).trim();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      user = credential.user;
      renderFamilyChoice();
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    showToast(friendlyError(error), "error");
    submitButton.disabled = false;
  }
}

async function createFamily(form) {
  const name = String(new FormData(form).get("familyName")).trim();
  if (!name) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    let createdId = "";
    let createdCode = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const familyRef = doc(collection(db, "families"));
      const code = makeInviteCode();
      const memberRef = doc(db, "families", familyRef.id, "members", user.uid);
      const codeRef = doc(db, "inviteCodes", code);
      const profileRef = doc(db, "users", user.uid);
      try {
        await runTransaction(db, async (transaction) => {
          const existingCode = await transaction.get(codeRef);
          if (existingCode.exists()) throw new Error("Código repetido. Tentando outro.");
          transaction.set(familyRef, { familyName: name, ownerUid: user.uid, createdAt: serverTimestamp() });
          transaction.set(memberRef, { uid: user.uid, displayName: userName(), role: "owner", joinedAt: serverTimestamp() });
          transaction.set(codeRef, { familyId: familyRef.id, createdBy: user.uid, createdAt: serverTimestamp() });
          transaction.set(profileRef, { familyId: familyRef.id, inviteCode: code, displayName: userName(), updatedAt: serverTimestamp() });
        });
        createdId = familyRef.id;
        createdCode = code;
        break;
      } catch (error) {
        if (error.message !== "Código repetido. Tentando outro.") throw error;
      }
    }
    if (!createdId) throw new Error("Não foi possível criar um código de convite. Tente de novo.");
    showToast("Lista criada! Agora convide sua família.");
    await loadUserHome();
    if (family?.id === createdId) {
      family.inviteCode = createdCode;
      renderApp();
      openFamilyModal();
    }
  } catch (error) {
    showToast(friendlyError(error), "error");
    button.disabled = false;
  }
}

async function joinFamily(form) {
  const code = String(new FormData(form).get("inviteCode")).trim().toUpperCase();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const codeSnap = await getDoc(doc(db, "inviteCodes", code));
    if (!codeSnap.exists()) throw new Error("Esse convite não foi encontrado. Confira as 8 letras.");
    const familyId = codeSnap.data().familyId;
    const profileRef = doc(db, "users", user.uid);
    const profileSnap = await getDoc(profileRef);
    const currentFamilyId = profileSnap.exists() ? profileSnap.data().familyId : null;
    if (currentFamilyId === familyId) throw new Error("Esta conta já está nesta lista.");

    const memberRef = doc(db, "families", familyId, "members", user.uid);
    let targetMembershipExists = false;
    try {
      const targetMembership = await getDoc(memberRef);
      targetMembershipExists = targetMembership.exists();
    } catch (error) {
      if (error.code !== "permission-denied") throw error;
    }

    const batch = writeBatch(db);
    if (currentFamilyId) {
      const oldMemberRef = doc(db, "families", currentFamilyId, "members", user.uid);
      const oldMembership = await getDoc(oldMemberRef);
      if (oldMembership.exists()) batch.delete(oldMemberRef);
    }
    if (!targetMembershipExists) {
      batch.set(memberRef, { uid: user.uid, displayName: userName(), role: "member", joinedAt: serverTimestamp(), joinCode: code });
    }
    batch.set(profileRef, { familyId, inviteCode: code, displayName: userName(), updatedAt: serverTimestamp() });
    await batch.commit();
    if (!targetMembershipExists) {
      try { await updateDoc(memberRef, { joinCode: deleteField() }); } catch { /* A validação do convite já foi concluída; a limpeza é uma melhoria de privacidade. */ }
    }
    showToast(currentFamilyId ? "Você trocou para a nova lista." : "Você entrou na lista da família!");
    await loadUserHome();
  } catch (error) {
    showToast(friendlyError(error), "error");
    button.disabled = false;
  }
}

async function addItem(form) {
  if (!family) return;
  const data = new FormData(form);
  const name = String(data.get("name")).trim();
  if (!name) return;
  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;
  try {
    await setDoc(doc(collection(db, familyPath(family.id), "items")), {
      name,
      quantity: String(data.get("quantity")).trim(),
      category: String(data.get("category")),
      purchased: false,
      addedBy: user.uid,
      addedByName: userName(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    form.reset();
    form.querySelector('[name="category"]').value = "hortifruti";
    document.querySelector("#item-name")?.focus();
  } catch (error) {
    showToast(friendlyError(error), "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function toggleItem(itemId) {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return;
  try {
    await updateDoc(doc(db, familyPath(family.id), "items", itemId), {
      purchased: !item.purchased,
      purchasedAt: !item.purchased ? serverTimestamp() : deleteField(),
      updatedAt: serverTimestamp()
    });
  } catch (error) { showToast(friendlyError(error), "error"); }
}

async function removeItem(itemId) {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return;
  try {
    await deleteDoc(doc(db, familyPath(family.id), "items", itemId));
    showToast(`“${item.name}” removido da lista.`);
  } catch (error) { showToast(friendlyError(error), "error"); }
}

function openFamilyModal() {
  const modal = document.querySelector("#family-modal");
  if (modal) {
    const membersPanel = modal.querySelector(".member-list");
    if (membersPanel && !modal.querySelector(".alternate-family-access")) {
      membersPanel.insertAdjacentHTML("afterend", `
        <div class="alternate-family-access">
          <button class="button button-secondary button-wide" type="button" data-action="show-alternate-join">Tenho um código de outra família</button>
          <form id="alternate-join-family-form" class="alternate-join-form" hidden>
            <p class="switch-family-notice">Ao continuar, esta conta sairá da lista atual e entrará na nova. Os itens anteriores não serão apagados.</p>
            <label class="field-label">Código de compartilhamento<input name="inviteCode" type="text" minlength="8" maxlength="8" placeholder="Ex.: ABCD1234" autocomplete="off" autocapitalize="characters" required /></label>
            <button class="button button-primary button-wide" type="submit">Entrar na outra lista</button>
            <button class="text-button alternate-join-cancel" type="button" data-action="cancel-alternate-join">Cancelar</button>
          </form>
        </div>`);
    }
    modal.hidden = false;
  }
}

async function copyInviteCode() {
  try {
    if (navigator.share) {
      await navigator.share({ title: `Lista ${family.familyName}`, text: `Entre na lista de compras da família ${family.familyName} com este código: ${family.inviteCode}` });
    } else {
      await navigator.clipboard.writeText(family.inviteCode);
      showToast("Código copiado. É só enviar para a família!");
    }
  } catch (error) {
    if (error.name !== "AbortError") showToast("Não consegui compartilhar. Tente copiar o código manualmente.", "error");
  }
}

appRoot.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === "auth-form") await handleAuthSubmit(form);
  if (form.id === "create-family-form") await createFamily(form);
  if (form.id === "join-family-form") await joinFamily(form);
  if (form.id === "alternate-join-family-form") await joinFamily(form);
  if (form.id === "add-item-form") await addItem(form);
});

appRoot.addEventListener("input", (event) => {
  if (event.target.id === "search-items") {
    searchTerm = event.target.value;
    renderItems();
  }
  if (event.target.name === "inviteCode") event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
});

appRoot.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "auth-mode") { authMode = authMode === "login" ? "register" : "login"; renderAuth(); }
  if (action === "signout") { stopSubscriptions(); await signOut(auth); }
  if (action === "tab") { currentTab = button.dataset.tab; renderApp(); }
  if (action === "category") { currentCategory = button.dataset.category; renderApp(); }
  if (action === "toggle-item") await toggleItem(button.dataset.id);
  if (action === "delete-item") await removeItem(button.dataset.id);
  if (action === "open-family") openFamilyModal();
  if (action === "close-family") { const modal = document.querySelector("#family-modal"); if (modal) modal.hidden = true; }
  if (action === "copy-code") await copyInviteCode();
  if (action === "show-alternate-join") {
    const form = document.querySelector("#alternate-join-family-form");
    if (form) { form.hidden = false; button.hidden = true; form.querySelector("input[name=inviteCode]")?.focus(); }
  }
  if (action === "cancel-alternate-join") {
    const form = document.querySelector("#alternate-join-family-form");
    const trigger = document.querySelector('[data-action="show-alternate-join"]');
    if (form) form.hidden = true;
    if (trigger) trigger.hidden = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const modal = document.querySelector("#family-modal");
    if (modal) modal.hidden = true;
  }
});

const firebaseConfig = window.FIREBASE_CONFIG || {};
const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("COLE_") && firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("SEU_");
if (!isConfigured) {
  renderSetupNeeded();
} else {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  onAuthStateChanged(auth, async (nextUser) => {
    stopSubscriptions();
    user = nextUser;
    currentTab = "needed";
    currentCategory = "all";
    searchTerm = "";
    if (!user) renderAuth();
    else await loadUserHome();
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
}
