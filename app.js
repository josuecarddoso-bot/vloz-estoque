/**
 * VLOZ TELECOM — SISTEMA DE ESTOQUE v3.0
 * Lógica de Negócio, Segurança e SKUs por Categoria
 */

 import { COLECOES, salvarDoc, excluirDoc, escutarColecao } from "./firebase.js";

 const App = (() => {
     // Estado interno do sistema
     let state = {
         user: { nome: "Josué", role: "admin" }, // Role: 'admin' ou 'tecnico'
         produtos: [],
         categorias: [
             { id: "cat1", nome: "Rede", prefixo: "RED" },
             { id: "cat2", nome: "Equipamentos", prefixo: "EQU" },
             { id: "cat3", nome: "Cabos", prefixo: "CAB" },
             { id: "cat4", nome: "Ferramentas", prefixo: "FER" }
         ]
     };
 
     /**
      * Geração Automática de SKU por Categoria
      */
     function handleCategoriaChange() {
         const catNome = document.getElementById('prodCategoria').value;
         const catObj = state.categorias.find(c => c.nome === catNome);
         const prefixo = catObj ? catObj.prefixo : "GEN";
         
         // Conta quantos produtos já existem nessa categoria
         const totalNaCat = state.produtos.filter(p => p.categoria === catNome).length;
         const novoCodigo = `${prefixo}-${(totalNaCat + 1).toString().padStart(3, '0')}`;
         
         document.getElementById('prodCodigo').value = novoCodigo;
     }
 
     /**
      * Renderização da Tabela com Trava de Segurança (RBAC)
      */
     function renderProdutos() {
         const tbody = document.getElementById('tabelaProdutosBody');
         if (!tbody) return;
 
         tbody.innerHTML = state.produtos.map(p => `
             <tr>
                 <td><strong style="color:var(--navy)">${p.codigo}</strong></td>
                 <td>${p.nome}</td>
                 <td><span style="font-size: 12px; color: #64748b;">${p.categoria}</span></td>
                 <td><strong>${p.qtd}</strong></td>
                 <td>
                     <div style="display: flex; gap: 8px;">
                         ${state.user.role === 'admin' 
                             ? `<button onclick="App.deletar('${p.id}')" style="cursor:pointer; border:none; background:none;">🗑️</button>` 
                             : '<span title="Apenas administradores">🔒</span>'}
                     </div>
                 </td>
             </tr>
         `).join('');
     }
 
     // Funções Públicas Expostas para o HTML
     return {
         init: () => {
             escutarColecao(COLECOES.produtos, (docs) => {
                 state.produtos = docs;
                 renderProdutos();
             });
         },
 
         login: () => {
             // Lógica simples de transição de tela
             document.getElementById('loginScreen').classList.add('hidden');
             document.getElementById('appShell').classList.remove('hidden');
             App.init();
         },
 
         logout: () => {
             location.reload();
         },
 
         navigate: (page) => {
             console.log("Navegando para:", page);
             // Lógica de troca de abas pode ser inserida aqui
         },
 
         openModalProduto: () => {
             document.getElementById('modalProduto').classList.remove('hidden');
         },
 
         closeModal: (id) => {
             document.getElementById(id).classList.add('hidden');
         },
 
         handleCategoriaChange,
 
         salvarProduto: async () => {
             const nome = document.getElementById('prodNome').value;
             const categoria = document.getElementById('prodCategoria').value;
             const codigo = document.getElementById('prodCodigo').value;
 
             if (!nome || !categoria) return alert("Preencha os campos!");
 
             const novoDoc = {
                 nome,
                 categoria,
                 codigo,
                 qtd: 0,
                 dataCriacao: new Date().toISOString()
             };
 
             await salvarDoc(COLECOES.produtos, novoDoc);
             App.closeModal('modalProduto');
         },
 
         deletar: async (id) => {
             if (state.user.role !== 'admin') return;
             if (confirm("Tem certeza que deseja excluir este item?")) {
                 await excluirDoc(COLECOES.produtos, id);
             }
         }
     };
 })();
 
 /**
  * EXPORTAÇÃO GLOBAL (CORREÇÃO DO ERRO)
  * Torna o objeto App disponível para os eventos 'onclick' do HTML
  */
 window.App = App; 
 
 export default App;
