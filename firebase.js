/**
 * ═══════════════════════════════════════════════════════════════
 *  VLOZ TELECOM — FIREBASE CONFIG v3.0
 *  Autenticação via Firebase Authentication (Email/Senha)
 *  Sincronização em tempo real via Firestore
 * ═══════════════════════════════════════════════════════════════
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ── 1. CONFIGURAÇÃO ─────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyC6mdmwhOIhRnsX1Q2JxLRL2Kh7xXOSJB0",
  authDomain: "vloz-estoque.firebaseapp.com",
  databaseURL: "https://vloz-estoque-default-rtdb.firebaseio.com",
  projectId: "vloz-estoque",
  storageBucket: "vloz-estoque.firebasestorage.app",
  messagingSenderId: "79794241039",
  appId: "1:79794241039:web:1cdf606d09828517296d7a"
};

/* ── 2. INICIALIZAÇÃO ─────────────────────────────────────────── */
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);
const auth        = getAuth(firebaseApp);

/* ── 3. COLEÇÕES ──────────────────────────────────────────────── */
const COLECOES = {
  produtos:   "produtos",
  categorias: "categorias",
  usuarios:   "usuarios",
  historico:  "historico",
};

/* ── 4. AUTENTICAÇÃO ─────────────────────────────────────────── */

/**
 * Faz login com email e senha no Firebase Authentication.
 * Após autenticar, busca os dados do usuário na coleção usuarios
 * usando o UID como chave. Se o documento existir com login igual
 * mas UID diferente (usuário recriado), corrige automaticamente.
 *
 * @param {string} loginVal  - Login digitado pelo usuário (ex: "josue")
 * @param {string} senhaVal  - Senha digitada
 * @returns {object} dados do usuário: { id, nome, login, perfil }
 */
async function autenticar(loginVal, senhaVal) {
  // Monta o email a partir do login (padrão: login@vloz.internal)
  const email = `${loginVal.trim()}@vloz.internal`;

  // Faz login no Firebase Auth
  const credencial = await signInWithEmailAndPassword(auth, email, senhaVal);
  const uid = credencial.user.uid;

  // Busca documento no Firestore pelo UID
  let snap = await getDoc(doc(db, COLECOES.usuarios, uid));

  // Se não encontrou pelo UID, busca pelo campo login na coleção
  // (cobre o caso de usuário recriado com UID diferente)
  if (!snap.exists()) {
    const { getDocs, where, query: fsQuery } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const col = collection(db, COLECOES.usuarios);
    const q   = fsQuery(col, where('login', '==', loginVal.trim()));
    const resultado = await getDocs(q);

    if (!resultado.empty) {
      // Encontrou o documento pelo login — migra para o novo UID
      const docAntigo = resultado.docs[0];
      const dadosAntigos = docAntigo.data();
      // Salva com o novo UID
      await setDoc(doc(db, COLECOES.usuarios, uid), {
        ...dadosAntigos,
        id: uid,
        _updatedAt: serverTimestamp(),
      });
      // Remove o documento antigo se o ID era diferente
      if (docAntigo.id !== uid) {
        await deleteDoc(doc(db, COLECOES.usuarios, docAntigo.id));
      }
      // Relê o documento recém-criado
      snap = await getDoc(doc(db, COLECOES.usuarios, uid));
    }
  }

  if (!snap.exists()) {
    await signOut(auth);
    throw new Error('Usuário não encontrado na base de dados.');
  }

  const dados = snap.data();
  return {
    id:     uid,
    nome:   dados.nome,
    login:  dados.login,
    perfil: dados.perfil || 'visualizador',
  };
}

/**
 * Cria um novo usuário no Firebase Authentication E no Firestore.
 * Deve ser chamado sempre que um novo usuário for cadastrado no sistema.
 *
 * @param {string} loginVal  - Login do usuário (ex: "pedro")
 * @param {string} senhaVal  - Senha
 * @param {object} dadosExtra - { nome, perfil } e outros campos
 * @returns {string} UID do usuário criado
 */
async function criarUsuarioAuth(loginVal, senhaVal, dadosExtra = {}) {
  const email = `${loginVal.trim()}@vloz.internal`;

  // Salva o usuário atual para não perder a sessão
  const usuarioAtual = auth.currentUser;

  // Cria no Firebase Authentication
  const credencial = await createUserWithEmailAndPassword(auth, email, senhaVal);
  const uid = credencial.user.uid;

  // Salva no Firestore com o UID como chave do documento
  await setDoc(doc(db, COLECOES.usuarios, uid), {
    ...dadosExtra,
    id:    uid,
    login: loginVal.trim(),
    _updatedAt: serverTimestamp(),
  });

  // Se havia um usuário logado antes, restaura a sessão dele
  // (criar usuário no Auth faz login automático no novo usuário)
  if (usuarioAtual) {
    // Força o Auth a reconhecer o usuário original novamente via token
    // O app vai continuar com a sessão do admin que está criando
    await signOut(auth);
    // Nota: o app.js deve fazer re-login do admin após chamar esta função
    // ou usar o Admin SDK no backend para evitar essa limitação
  }

  return uid;
}

/**
 * Atualiza a senha de um usuário no Firebase Authentication.
 * Só funciona para o usuário atualmente logado.
 *
 * @param {string} novaSenha
 */
async function atualizarSenhaAuth(novaSenha) {
  const user = auth.currentUser;
  if (!user) throw new Error('Nenhum usuário logado');
  await updatePassword(user, novaSenha);
}

/**
 * Remove um usuário do Firestore E do Firebase Authentication.
 * Como o SDK client-side só permite deletar o próprio usuário,
 * a estratégia é: logar temporariamente como o usuário alvo,
 * deletar a conta dele, e restaurar a sessão do admin.
 *
 * @param {string} uid        - UID do usuário a deletar
 * @param {string} loginAlvo  - Login do usuário a deletar (ex: "pedro")
 * @param {string} senhaAlvo  - Senha atual do usuário a deletar
 * @param {string} adminLogin - Login do admin para restaurar sessão
 * @param {string} adminSenha - Senha do admin para restaurar sessão
 */
async function deletarUsuarioAuth(uid, loginAlvo, senhaAlvo, adminLogin, adminSenha) {
  const emailAlvo = `${loginAlvo.trim()}@vloz.internal`;

  // Faz login como o usuário alvo
  const credAlvo = await signInWithEmailAndPassword(auth, emailAlvo, senhaAlvo);

  // Deleta a conta do Firebase Authentication
  await credAlvo.user.delete();

  // Remove do Firestore
  await deleteDoc(doc(db, COLECOES.usuarios, uid));

  // Restaura sessão do admin
  const credAdmin = await signInWithEmailAndPassword(
    auth,
    `${adminLogin.trim()}@vloz.internal`,
    adminSenha
  );

  return credAdmin.user.uid;
}

/**
 * Faz logout do Firebase Authentication.
 */
async function desautenticar() {
  await signOut(auth);
}

/**
 * Observa mudanças no estado de autenticação.
 * Retorna a função unsubscribe.
 *
 * @param {function} callback - Recebe o user do Firebase Auth ou null
 */
function observarAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* ── 5. FUNÇÕES DE ESCRITA ────────────────────────────────────── */

async function salvarDoc(colecao, dado) {
  if (!dado?.id) {
    console.error('[Firebase] Tentativa de salvar documento sem id:', dado);
    throw new Error('Documento sem id');
  }
  try {
    const ref = doc(db, colecao, dado.id);
    await setDoc(ref, { ...dado, _updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error(`[Firebase] Erro ao salvar em ${colecao}:`, e);
    throw e;
  }
}

async function excluirDoc(colecao, id) {
  if (!id) throw new Error('ID não fornecido para exclusão');
  try {
    await deleteDoc(doc(db, colecao, id));
  } catch (e) {
    console.error(`[Firebase] Erro ao excluir de ${colecao}:`, e);
    throw e;
  }
}

async function salvarLote(colecao, lista) {
  if (!Array.isArray(lista) || !lista.length) return;
  try {
    const LIMITE = 500;
    for (let i = 0; i < lista.length; i += LIMITE) {
      const batch = writeBatch(db);
      lista.slice(i, i + LIMITE).forEach(item => {
        if (!item?.id) return;
        const ref = doc(db, colecao, item.id);
        batch.set(ref, { ...item, _updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
    }
  } catch (e) {
    console.error(`[Firebase] Erro no batch de ${colecao}:`, e);
    throw e;
  }
}

/* ── 6. LISTENERS EM TEMPO REAL ──────────────────────────────── */

function escutarColecao(colecao, callback, ordenar = null) {
  const col = collection(db, colecao);
  const q   = ordenar ? query(col, orderBy(ordenar)) : col;

  return onSnapshot(
    q,
    (snapshot) => {
      const lista = snapshot.docs.map(d => {
        const data = { ...d.data() };
        delete data._updatedAt;
        return data;
      });
      callback(lista);
    },
    (error) => {
      console.error(`[Firebase] Erro ao escutar ${colecao}:`, error);
    }
  );
}

/* ── 7. EXPORTAÇÕES ─────────────────────────────────────────── */
export {
  db,
  auth,
  COLECOES,
  autenticar,
  criarUsuarioAuth,
  atualizarSenhaAuth,
  deletarUsuarioAuth,
  desautenticar,
  observarAuth,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
};
