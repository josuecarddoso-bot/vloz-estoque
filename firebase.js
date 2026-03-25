/**
 * ═══════════════════════════════════════════════════════════════
 *  VLOZ TELECOM — FIREBASE CONFIG v2.0
 *  Sincronização em tempo real via Firestore
 * ═══════════════════════════════════════════════════════════════
 *
 *  ⚠️  SEGURANÇA: Substitua as credenciais abaixo pelas do seu
 *      projeto Firebase. Para produção, considere usar variáveis
 *      de ambiente (ex: Vercel Environment Variables) e não
 *      commitar chaves reais no repositório público.
 *
 *      Console Firebase → Configurações → Seus apps → SDK Web
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
   ⚠️ Substitua pelos valores do SEU projeto Firebase.
   Em produção, use variáveis de ambiente via Vercel ou similar.
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

/* ── 2. INICIALIZAÇÃO ─────────────────────────────────────────── */
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

/* ── 3. COLEÇÕES ──────────────────────────────────────────────── */
const COLECOES = {
  produtos:   "produtos",
  categorias: "categorias",
  usuarios:   "usuarios",
  historico:  "historico",
};

/* ── 4. FUNÇÕES DE ESCRITA ────────────────────────────────────── */

/**
 * Salva (cria ou atualiza) um único documento em uma coleção.
 * @param {string} colecao  - Nome da coleção
 * @param {object} dado     - Objeto com campo `id` obrigatório
 */
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

/**
 * Exclui um documento de uma coleção.
 * @param {string} colecao - Nome da coleção
 * @param {string} id      - ID do documento
 */
async function excluirDoc(colecao, id) {
  if (!id) throw new Error('ID não fornecido para exclusão');
  try {
    await deleteDoc(doc(db, colecao, id));
  } catch (e) {
    console.error(`[Firebase] Erro ao excluir de ${colecao}:`, e);
    throw e;
  }
}

/**
 * Salva múltiplos documentos em lote (batch write).
 * Limita a 500 operações por batch (limite do Firestore).
 * @param {string} colecao - Nome da coleção
 * @param {Array}  lista   - Array de objetos com campo `id`
 */
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

/* ── 5. LISTENERS EM TEMPO REAL ──────────────────────────────── */

/**
 * Escuta uma coleção em tempo real.
 * Retorna função `unsubscribe()` para parar de escutar.
 *
 * @param {string}   colecao   - Nome da coleção
 * @param {function} callback  - Recebe o array atualizado de documentos
 * @param {string}   [ordenar] - Campo para orderBy (opcional)
 * @returns {function} unsubscribe
 */
function escutarColecao(colecao, callback, ordenar = null) {
  const col = collection(db, colecao);
  const q   = ordenar ? query(col, orderBy(ordenar)) : col;

  return onSnapshot(
    q,
    (snapshot) => {
      const lista = snapshot.docs.map(d => {
        const data = { ...d.data() };
        delete data._updatedAt; // Remove campo interno antes de passar ao app
        return data;
      });
      callback(lista);
    },
    (error) => {
      console.error(`[Firebase] Erro ao escutar ${colecao}:`, error);
    }
  );
}

/* ── 6. EXPORTAÇÕES ─────────────────────────────────────────── */
export {
  db,
  COLECOES,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
};
