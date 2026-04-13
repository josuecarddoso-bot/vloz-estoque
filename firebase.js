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
 * usando o email como chave de busca.
 *
 * @param {string} loginVal  - Login digitado pelo usuário (ex: "josue")
 * @param {string} senhaVal  - Senha digitada
 * @returns {object} dados do usuário: { id, nome, login, perfil }
 */
async function autenticar(loginVal, senhaVal) {
  // Monta o email a partir do login (padrão: login@vloz.internal)
  const email = `${loginVal}@vloz.internal`;

  // Faz login no Firebase Auth
  const credencial = await signInWithEmailAndPassword(auth, email, senhaVal);
  const uid = credencial.user.uid;

  // Busca dados do usuário no Firestore usando o UID do Firebase Auth
  const snap = await getDoc(doc(db, COLECOES.usuarios, uid));
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
  desautenticar,
  observarAuth,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
};
