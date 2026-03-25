/**
 * VLOZ TELECOM — SISTEMA DE ESTOQUE (ATUALIZADO)
 * Código automático por categoria
 */

import {
  COLECOES,
  salvarDoc,
  excluirDoc,
  salvarLote,
  escutarColecao,
} from "./firebase.js";

/* ===== PREFIXOS POR CATEGORIA ===== */
const PREFIXOS = {
  'cat1': 'RED','cat2': 'RED','cat3': 'RED','cat4': 'RED','cat5': 'RED',
  'cat6': 'RED','cat7': 'RED','cat8': 'RED','cat9': 'RED','cat10': 'RED',
  'cat11': 'ESC','cat12': 'ESC','cat13': 'ESC',
  'cat14': 'LIM','cat15': 'LIM',
};

function gerarCodigoPorCategoria(categoriaId, produtos) {
  const prefixo = PREFIXOS[categoriaId] || 'GEN';

  const filtrados = produtos.filter(p => p.categoriaId === categoriaId);

  const numeros = filtrados.map(p => {
    const partes = p.codigo?.split('-');
    return parseInt(partes?.[1]) || 0;
  });

  const maior = numeros.length ? Math.max(...numeros) : 0;
  const novoNumero = String(maior + 1).padStart(3, '0');

  return `${prefixo}-${novoNumero}`;
}

const App = (() => {

  let state = {
    produtos: [],
    categorias: [],
    usuarios: [],
    historico: [],
    sessao: null,
  };

  function pid() {
    return 'id_' + Math.random().toString(36).slice(2);
  }

  function toast(msg, tipo='success') {
    console.log(tipo.toUpperCase(), msg);
  }

  function populateSelects() {
    const sel = document.getElementById('prodCategoria');
    if (!sel) return;

    sel.innerHTML = '<option value="">Selecione…</option>';
    state.categorias.forEach(c => {
      sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });
  }

  function openModalProduto() {
    document.getElementById('prodId').value = '';
    document.getElementById('prodNome').value = '';
    document.getElementById('prodCodigo').value = '';
    document.getElementById('prodCategoria').value = '';
    document.getElementById('prodQtd').value = '0';

    populateSelects();

    setTimeout(() => {
      const select = document.getElementById('prodCategoria');

      select.onchange = () => {
        const categoriaId = select.value;
        if (!categoriaId) return;

        const codigo = gerarCodigoPorCategoria(categoriaId, state.produtos);
        document.getElementById('prodCodigo').value = codigo;
      };
    }, 100);
  }

  async function salvarProduto() {
    const id = document.getElementById('prodId').value;
    const nome = document.getElementById('prodNome').value.trim();

    let codigo = document.getElementById('prodCodigo').value.trim();
    const categoriaId = document.getElementById('prodCategoria').value;

    if (!codigo && categoriaId) {
      codigo = gerarCodigoPorCategoria(categoriaId, state.produtos);
    }

    if (!nome || !codigo) {
      toast('Nome e código obrigatórios', 'error');
      return;
    }

    const dados = {
      id: id || pid(),
      nome,
      codigo,
      categoriaId,
      qtd: Number(document.getElementById('prodQtd').value) || 0
    };

    try {
      if (id) {
        await salvarDoc(COLECOES.produtos, dados);
        toast('Atualizado');
      } else {
        if (state.produtos.find(p => p.codigo === codigo)) {
          toast('Código duplicado', 'error');
          return;
        }

        await salvarDoc(COLECOES.produtos, dados);
        toast('Cadastrado');
      }
    } catch {
      toast('Erro ao salvar', 'error');
    }
  }

  return {
    openModalProduto,
    salvarProduto
  };

})();

window.App = App;
