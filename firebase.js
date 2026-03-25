/**
 * ═══════════════════════════════════════════════════════════════
 *  VLOZ TELECOM — FIREBASE CONFIG v1.0
 *  Sincronização em tempo real via Firestore
 * ═══════════════════════════════════════════════════════════════
 *
 *  ⚠️  SUBSTITUA os valores abaixo pelos do SEU projeto Firebase:
 *       Console Firebase → Configurações do projeto → Seus apps → SDK
 * ═══════════════════════════════════════════════════════════════
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ── 1. CONFIGURAÇÃO ────────────────────────────────────────────
   Cole aqui as credenciais do seu projeto Firebase.
   Acesse: https://console.firebase.google.com
   → Seu projeto → ⚙️ Configurações → Seus apps → </> Web
   ─────────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyC6mdmwhOIhRnsX1Q2JxLRL2Kh7xXOSJB0",
  authDomain: "vloz-estoque.firebaseapp.com",
  databaseURL: "https://vloz-estoque-default-rtdb.firebaseio.com",
  projectId: "vloz-estoque",
  storageBucket: "vloz-estoque.firebasestorage.app",
  messagingSenderId: "79794241039",
  appId: "1:79794241039:web:1cdf606d09828517296d7a"
};

/* ── 2. INICIALIZAÇÃO ───────────────────────────────────────────
   Não altere este bloco.
   ─────────────────────────────────────────────────────────────── */
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

/* ── 3. COLEÇÕES ────────────────────────────────────────────────
   Mapeamento entre as chaves internas do app e as coleções do Firestore.
   ─────────────────────────────────────────────────────────────── */
const COLECOES = {
  produtos:   "produtos",
  categorias: "categorias",
  usuarios:   "usuarios",
  historico:  "historico",
};

/* ── 4. FUNÇÕES DE ESCRITA ──────────────────────────────────────
   Usadas pelo app para salvar/excluir documentos no Firestore.
   ─────────────────────────────────────────────────────────────── */

/**
 * Salva (cria ou atualiza) um único documento em uma coleção.
 * @param {string} colecao  - Nome da coleção (ex: "produtos")
 * @param {object} dado     - Objeto com campo `id` obrigatório
 */
async function salvarDoc(colecao, dado) {
  try {
    const ref = doc(db, colecao, dado.id);
    await setDoc(ref, { ...dado, _updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error(`[Firebase] Erro ao salvar em ${colecao}:`, e);
    throw e;
  }
}

/**
 * Exclui um documento de uma coleção.
 * @param {string} colecao - Nome da coleção
 * @param {string} id      - ID do documento
 */
async function excluirDoc(colecao, id) {
  try {
    await deleteDoc(doc(db, colecao, id));
  } catch (e) {
    console.error(`[Firebase] Erro ao excluir de ${colecao}:`, e);
    throw e;
  }
}

/**
 * Salva múltiplos documentos de uma coleção em lote (batch write).
 * Útil para importação de backup ou seed inicial.
 * @param {string} colecao - Nome da coleção
 * @param {Array}  lista   - Array de objetos, cada um com campo `id`
 */
async function salvarLote(colecao, lista) {
  try {
    const LIMITE = 500; // Firestore limita 500 operações por batch
    for (let i = 0; i < lista.length; i += LIMITE) {
      const batch = writeBatch(db);
      lista.slice(i, i + LIMITE).forEach(item => {
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

/* ── 5. LISTENERS EM TEMPO REAL ─────────────────────────────────
   onSnapshot: o Firestore chama o callback SEMPRE que os dados mudam,
   inclusive quando outro usuário faz uma alteração. É assim que o app
   fica sincronizado em tempo real para todos os usuários.
   ─────────────────────────────────────────────────────────────── */

/**
 * Escuta uma coleção em tempo real e chama `callback(lista)` a cada mudança.
 * Retorna uma função `unsubscribe()` para parar de escutar.
 *
 * @param {string}   colecao   - Nome da coleção
 * @param {function} callback  - Recebe o array atualizado de documentos
 * @param {string}   [ordenar] - Campo para orderBy (opcional)
 */
function escutarColecao(colecao, callback, ordenar = null) {
  const col = collection(db, colecao);
  const q   = ordenar ? query(col, orderBy(ordenar)) : col;

  return onSnapshot(
    q,
    (snapshot) => {
      const lista = snapshot.docs.map(d => {
        const data = d.data();
        // Remove campos internos do Firestore antes de passar ao app
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

/* ── 6. EXPORTAÇÕES ─────────────────────────────────────────────
   O app.js importa apenas estas funções — não precisa conhecer o Firestore.
   ─────────────────────────────────────────────────────────────── */
export {
  db,
  COLECOES,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
};
