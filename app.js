/* Importador de NFS-e — leitura de XML GINFES (Fortaleza) e interface. Sem dependências. */
(function () {
  'use strict';

  var state = { notas: [], ignorados: [], seq: 0, pagina: 1, porPagina: 15 };
  var RANK = { cancelada: 3, processada: 2, desconhecida: 1, processamento: 0 };
  var STATUS = {
    processada: { rotulo: 'Processada', classe: 'ok' },
    processamento: { rotulo: 'Em processamento', classe: 'warn' },
    cancelada: { rotulo: 'Cancelada', classe: 'bad' },
    desconhecida: { rotulo: 'Não informado', classe: 'neutral' }
  };

  // ---------- leitura do XML ----------

  function filho(el, tag) {
    if (!el) return null;
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].localName === tag) return el.children[i];
    }
    return null;
  }

  function caminho(el) {
    for (var i = 1; i < arguments.length; i++) {
      el = filho(el, arguments[i]);
      if (!el) return null;
    }
    return el;
  }

  function texto(el) {
    return el && el.textContent ? el.textContent.trim() : '';
  }

  function primeiro() {
    for (var i = 0; i < arguments.length; i++) {
      var t = texto(arguments[i]);
      if (t) return t;
    }
    return '';
  }

  function numero(el) {
    var t = texto(el).replace(/\s/g, '');
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }

  function municipio(codigo, uf) {
    var dados = (window.MUNICIPIOS || {})[codigo];
    if (dados) return { nome: dados[0], uf: dados[1] || uf || '' };
    return { nome: '', uf: uf || '' };
  }

  function lerDocumento(xml) {
    var doc;
    try {
      doc = new DOMParser().parseFromString(xml, 'application/xml');
    } catch (e) {
      return { erro: 'XML inválido' };
    }
    if (!doc || doc.getElementsByTagName('parsererror').length) return { erro: 'XML inválido' };

    var raiz = doc.documentElement;
    if (!raiz || !/^nfse$/i.test(raiz.localName)) return { erro: 'não é uma NFS-e (layout NFSE/GINFES ou nacional)' };
    return { raiz: raiz };
  }

  function parseNfse(nfse, arquivo) {
    var raiz = nfse.ownerDocument.documentElement;
    // No layout novo os dados ficam em InfNfse; no antigo, direto em Nfse.
    var info = filho(nfse, 'InfNfse') || nfse;
    var servico = filho(info, 'Servico');
    var valores = filho(servico, 'Valores');
    if (!servico || !valores) return { erro: 'NFS-e sem bloco de serviço' };

    var tomadorEl = filho(info, 'TomadorServico');
    var prestadorEl = filho(info, 'PrestadorServico');
    var documento = caminho(tomadorEl, 'IdentificacaoTomador', 'CpfCnpj');

    var situacao = texto(filho(info, 'SituacaoAdn'));
    var cancelamento = caminho(raiz, 'Cancelamento', 'Confirmacao', 'InfConfirmacaoCancelamento');
    var cancelada = /^true$/i.test(texto(filho(cancelamento, 'Sucesso'))) || /cancelad/i.test(situacao);
    var status = 'desconhecida';
    if (cancelada) status = 'cancelada';
    else if (/em\s*processamento/i.test(situacao)) status = 'processamento';
    else if (/processad/i.test(situacao)) status = 'processada';

    var numeroNota = primeiro(filho(info, 'Numero'), caminho(info, 'IdentificacaoNfse', 'Numero'));
    var dataTexto = primeiro(filho(info, 'DataEmissao'), filho(nfse, 'DataEmissao'));
    var dataIso = (dataTexto.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    var codigoMunicipio = primeiro(
      filho(servico, 'CodigoMunicipio'),
      filho(servico, 'MunicipioPrestacaoServico'),
      caminho(info, 'OrgaoGerador', 'CodigoMunicipio'),
      caminho(tomadorEl, 'Endereco', 'CodigoMunicipio'),
      caminho(tomadorEl, 'Endereco', 'Cidade')
    );
    var uf = primeiro(
      caminho(info, 'OrgaoGerador', 'Uf'),
      caminho(tomadorEl, 'Endereco', 'Uf'),
      caminho(tomadorEl, 'Endereco', 'Estado')
    );
    var municipioNota = municipio(codigoMunicipio, uf);

    var valorServico = numero(filho(valores, 'ValorServicos'));
    var liquidoEl = filho(valores, 'ValorLiquidoNfse');
    var valorTotal = liquidoEl ? numero(liquidoEl) : valorServico;
    var codigoIssRetido = texto(filho(valores, 'IssRetido'));
    var retidoEl = filho(valores, 'ValorIssRetido');
    var valorIssRetido = retidoEl ? numero(retidoEl) : null;
    var issRetido = /^1$/.test(codigoIssRetido) || (!codigoIssRetido && valorIssRetido > 0);
    var issEl = filho(valores, 'ValorIss');
    var valorIss = issEl ? numero(issEl) : (valorIssRetido || 0);

    var chave = primeiro(filho(info, 'ChaveAcesso'), filho(nfse, 'ChaveAcesso'));
    var prestadorDoc = primeiro(caminho(prestadorEl, 'IdentificacaoPrestador', 'Cnpj'), caminho(prestadorEl, 'IdentificacaoPrestador', 'Cpf'));

    if (!numeroNota && !chave) return { erro: 'NFS-e sem número identificado' };

    return {
      id: 'n' + (++state.seq),
      chave: chave || [prestadorDoc, numeroNota, dataIso].join('|'),
      arquivo: arquivo || '',
      numero: numeroNota,
      dataIso: dataIso,
      tomador: primeiro(filho(tomadorEl, 'RazaoSocial'), caminho(info, 'Tomador', 'RazaoSocial')),
      cpfCnpj: primeiro(filho(documento, 'Cnpj'), filho(documento, 'Cpf'), filho(tomadorEl, 'CpfCnpj')),
      atividade: primeiro(filho(servico, 'CodigoCnae'), filho(servico, 'CodigoTributacaoMunicipio')),
      item: texto(filho(servico, 'ItemListaServico')),
      discriminacao: texto(filho(servico, 'Discriminacao')),
      valorServico: valorServico,
      valorTotal: valorTotal,
      aliquota: numero(filho(valores, 'Aliquota')),
      issRetido: issRetido,
      valorIss: valorIss,
      valorIssRetido: valorIssRetido,
      inss: numero(filho(valores, 'ValorInss')),
      municipio: municipioNota.nome,
      municipioUf: municipioNota.uf,
      municipioCodigo: codigoMunicipio,
      status: status,
      situacaoXml: situacao,
      prestador: texto(filho(prestadorEl, 'RazaoSocial')),
      prestadorDoc: prestadorDoc
    };
  }

  function parseNacional(inf, arquivo) {
    var dps = caminho(inf, 'DPS', 'infDPS');
    var emit = filho(inf, 'emit');
    var toma = filho(dps, 'toma');
    var serv = filho(dps, 'serv');
    var cServ = filho(serv, 'cServ');
    var valoresDps = filho(dps, 'valores');
    var valoresNfse = filho(inf, 'valores');
    var tribMun = caminho(valoresDps, 'trib', 'tribMun');

    var numeroNota = texto(filho(inf, 'nNFSe'));
    var dataTexto = primeiro(filho(dps, 'dhEmi'), filho(inf, 'dhProc'));
    var dataIso = (dataTexto.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];

    var codigoMunicipio = primeiro(
      filho(inf, 'cLocIncid'),
      caminho(serv, 'locPrest', 'cLocPrestacao'),
      caminho(emit, 'enderNac', 'cMun')
    );
    var uf = primeiro(
      caminho(emit, 'enderNac', 'UF'),
      caminho(toma, 'end', 'endNac', 'UF')
    );
    var municipioNota = municipio(codigoMunicipio, uf);

    var valorServico = numero(caminho(valoresDps, 'vServPrest', 'vServ'));
    var liquidoEl = filho(valoresNfse, 'vLiq');
    var valorTotal = liquidoEl ? numero(liquidoEl) : valorServico;

    // tpRetISSQN: 1 = não retido, 2 = retido pelo tomador, 3 = retido pelo intermediário.
    var tpRetIss = texto(filho(tribMun, 'tpRetISSQN'));
    var issRetido = tpRetIss === '2' || tpRetIss === '3';
    var issEl = filho(valoresNfse, 'vISSQN');
    var valorIss = issEl ? numero(issEl) : 0;
    var valorIssRetido = issRetido && issEl ? numero(issEl) : null;
    var aliquota = numero(filho(valoresNfse, 'pAliqAplic')) || numero(filho(tribMun, 'pAliq'));

    var chave = (inf.getAttribute('Id') || '').trim();
    var prestadorDoc = primeiro(filho(emit, 'CNPJ'), filho(emit, 'CPF'));

    if (!numeroNota && !chave) return { erro: 'NFS-e sem número identificado' };

    // cStat: 100 gerada, 101 substituição, 102 decisão judicial, 103 avulsa, 107 MEI.
    var cStat = texto(filho(inf, 'cStat'));
    var status = /^(100|101|102|103|107)$/.test(cStat) ? 'processada' : 'desconhecida';

    return {
      id: 'n' + (++state.seq),
      chave: chave || [prestadorDoc, numeroNota, dataIso].join('|'),
      arquivo: arquivo || '',
      numero: numeroNota,
      dataIso: dataIso,
      tomador: texto(filho(toma, 'xNome')),
      cpfCnpj: primeiro(filho(toma, 'CNPJ'), filho(toma, 'CPF')),
      atividade: primeiro(filho(cServ, 'cTribNac'), filho(cServ, 'cTribMun')),
      item: texto(filho(cServ, 'cTribMun')),
      discriminacao: texto(filho(cServ, 'xDescServ')),
      valorServico: valorServico,
      valorTotal: valorTotal,
      aliquota: aliquota,
      issRetido: issRetido,
      valorIss: valorIss,
      valorIssRetido: valorIssRetido,
      inss: numero(caminho(valoresDps, 'trib', 'tribFed', 'vInss')),
      municipio: municipioNota.nome,
      municipioUf: municipioNota.uf,
      municipioCodigo: codigoMunicipio,
      status: status,
      situacaoXml: cStat,
      prestador: texto(filho(emit, 'xNome')),
      prestadorDoc: prestadorDoc
    };
  }

  function parseXmls(xml, arquivo) {
    var lido = lerDocumento(xml);
    if (lido.erro) return [lido];

    // Layout nacional (sped.fazenda.gov.br/nfse): dados em infNFSe.
    var nacionais = lido.raiz.getElementsByTagNameNS('*', 'infNFSe');
    if (nacionais.length) {
      return Array.prototype.map.call(nacionais, function (inf) {
        return parseNacional(inf, arquivo);
      });
    }

    // XMLs assinados podem trazer um Nfse-envelope; só vale o que tem dados.
    var todos = lido.raiz.getElementsByTagNameNS('*', 'Nfse');
    var nfses = [];
    for (var i = 0; i < todos.length; i++) {
      if (filho(todos[i], 'InfNfse') || filho(todos[i], 'Servico')) nfses.push(todos[i]);
    }
    if (!nfses.length) return [{ erro: 'não é uma NFS-e (layout NFSE/GINFES)' }];

    return nfses.map(function (nfse) { return parseNfse(nfse, arquivo); });
  }

  function parseXml(xml, arquivo) {
    return parseXmls(xml, arquivo)[0] || { erro: 'não é uma NFS-e (layout NFSE/GINFES)' };
  }

  // ---------- formatação ----------

  function formatarData(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }

  function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarAliquota(valor) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';
  }

  function formatarDocumento(doc) {
    var d = String(doc || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return doc || '—';
  }

  function normalizar(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function mensagem(texto, erro) {
    var el = document.getElementById('mensagem');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mensagem' + (erro ? ' erro' : '');
  }

  function ignorar(arquivo, motivo) {
    state.ignorados.push({ arquivo: arquivo, motivo: motivo });
  }

  // ---------- importação ----------

  async function lerConteudo(arquivo) {
    var bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder('utf-16le').decode(bytes).replace(/^\uFEFF/, '');
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder('utf-16be').decode(bytes).replace(/^\uFEFF/, '');
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    } catch (e) {
      // Alguns emissores gravam latin-1 mesmo declarando UTF-8 no XML.
      return new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, '');
    }
  }

  // Devolve a versão que fica na lista, ou null quando a nota é nova.
  function mesclar(notas, porChave, nota) {
    var existente = porChave[nota.chave];
    if (!existente) {
      notas.push(nota);
      porChave[nota.chave] = nota;
      return null;
    }
    if (RANK[nota.status] > RANK[existente.status]) {
      nota.id = existente.id;
      notas[notas.indexOf(existente)] = nota;
      porChave[nota.chave] = nota;
      return nota;
    }
    return existente;
  }

  async function importar(lista) {
    var arquivos = Array.prototype.slice.call(lista || []);
    var xmls = [];
    arquivos.forEach(function (f) {
      if (/\.xml$/i.test(f.name)) xmls.push(f);
      else ignorar(f.webkitRelativePath || f.name, 'não é XML');
    });
    if (!xmls.length) {
      mensagem(arquivos.length ? 'Nenhum arquivo XML encontrado na seleção.' : 'Selecione ao menos um XML.', true);
      render();
      return;
    }

    var porChave = {};
    state.notas.forEach(function (n) { porChave[n.chave] = n; });

    var novas = 0, duplicadas = 0, falhas = 0;
    var LOTE = 50;

    for (var i = 0; i < xmls.length; i += LOTE) {
      var lote = xmls.slice(i, i + LOTE);
      mensagem('Lendo ' + Math.min(i + LOTE, xmls.length) + ' de ' + xmls.length + ' arquivo(s)...');

      var lidos = await Promise.all(lote.map(function (f) {
        return lerConteudo(f).then(function (conteudo) {
          return { arquivo: f.webkitRelativePath || f.name, conteudo: conteudo };
        }).catch(function () {
          return { arquivo: f.webkitRelativePath || f.name, erro: 'não foi possível ler o arquivo' };
        });
      }));

      lidos.forEach(function (lido) {
        if (lido.erro) { ignorar(lido.arquivo, lido.erro); falhas++; return; }

        parseXmls(lido.conteudo, lido.arquivo).forEach(function (nota) {
          if (nota.erro) { ignorar(lido.arquivo, nota.erro); falhas++; return; }

          var mantida = mesclar(state.notas, porChave, nota);
          if (!mantida) { novas++; return; }

          duplicadas++;
          ignorar(lido.arquivo, 'nota duplicada (versão mantida: ' + STATUS[mantida.status].rotulo + ')');
        });
      });
    }

    state.notas.sort(function (a, b) {
      return a.dataIso.localeCompare(b.dataIso) || a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true });
    });
    state.pagina = 1;

    render();

    var partes = [novas + ' nota(s) importada(s)'];
    if (duplicadas) partes.push(duplicadas + ' duplicada(s) ignorada(s)');
    if (falhas) partes.push(falhas + ' arquivo(s) não reconhecido(s)');
    mensagem(partes.join(' · ') + '.', falhas > 0);
  }

  function lerEntrada(entrada, destino) {
    return new Promise(function (resolve) {
      if (entrada.isFile) {
        entrada.file(function (f) { destino.push(f); resolve(); }, resolve);
      } else if (entrada.isDirectory) {
        var leitor = entrada.createReader();
        var lerLote = function () {
          leitor.readEntries(function (lote) {
            if (!lote.length) { resolve(); return; }
            Promise.all(lote.map(function (e) { return lerEntrada(e, destino); })).then(lerLote, resolve);
          }, resolve);
        };
        lerLote();
      } else {
        resolve();
      }
    });
  }

  // ---------- filtros e totais ----------

  function filtradas() {
    var termo = normalizar(document.getElementById('busca').value);
    var status = document.getElementById('filtroStatus').value;
    var de = document.getElementById('dataDe').value;
    var ate = document.getElementById('dataAte').value;

    return state.notas.filter(function (n) {
      if (status && n.status !== status) return false;
      if (de && (!n.dataIso || n.dataIso < de)) return false;
      if (ate && (!n.dataIso || n.dataIso > ate)) return false;
      if (termo) {
        var alvo = normalizar([n.numero, n.tomador, n.cpfCnpj, n.atividade, n.item, n.municipio, n.municipioUf, n.prestador, n.arquivo].join(' '));
        if (alvo.indexOf(termo) === -1) return false;
      }
      return true;
    });
  }

  function somar(notas, campo) {
    return notas.reduce(function (total, n) { return total + n[campo]; }, 0);
  }

  // ---------- renderização ----------

  function celula(conteudo, classe) {
    var td = document.createElement('td');
    td.textContent = conteudo;
    if (classe) td.className = classe;
    return td;
  }

  function celulaComDetalhe(principal, detalhe) {
    var td = document.createElement('td');
    td.appendChild(document.createTextNode(principal));
    if (detalhe) {
      var small = document.createElement('span');
      small.className = 'mini';
      small.textContent = detalhe;
      td.appendChild(small);
    }
    return td;
  }

  function linha(nota) {
    var tr = document.createElement('tr');
    if (nota.status === 'cancelada') tr.className = 'cancelada';

    tr.appendChild(celula(formatarData(nota.dataIso)));
    tr.appendChild(celula(nota.numero || '—'));

    var tdTomador = celulaComDetalhe(nota.tomador || '—', formatarDocumento(nota.cpfCnpj));
    tdTomador.className = 'nome';
    tdTomador.title = nota.tomador || '';
    tr.appendChild(tdTomador);

    tr.appendChild(celulaComDetalhe(nota.atividade || '—', nota.item ? 'Item ' + nota.item : ''));

    tr.appendChild(celula(formatarMoeda(nota.valorServico), 'num'));
    tr.appendChild(celula(formatarMoeda(nota.valorTotal), 'num'));
    tr.appendChild(celula(formatarAliquota(nota.aliquota), 'num'));
    tr.appendChild(celula(nota.issRetido ? 'Sim' : 'Não'));
    tr.appendChild(celula(formatarMoeda(nota.valorIss), 'num'));
    tr.appendChild(celula(formatarMoeda(nota.inss), 'num'));

    var lugar = nota.municipio || (nota.municipioCodigo ? 'Cód. ' + nota.municipioCodigo : '—');
    var detalheLugar = nota.municipio && nota.municipioCodigo
      ? nota.municipioCodigo + (nota.municipioUf ? ' / ' + nota.municipioUf : '')
      : (nota.municipioUf || '');
    tr.appendChild(celulaComDetalhe(lugar, detalheLugar));

    var tdStatus = document.createElement('td');
    var tag = document.createElement('span');
    tag.className = 'tag ' + STATUS[nota.status].classe;
    tag.textContent = STATUS[nota.status].rotulo;
    tdStatus.appendChild(tag);
    tr.appendChild(tdStatus);

    var tdAcao = document.createElement('td');
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'remover';
    botao.dataset.id = nota.id;
    botao.title = 'Remover esta nota da lista';
    botao.setAttribute('aria-label', 'Remover nota ' + (nota.numero || ''));
    botao.textContent = '×';
    tdAcao.appendChild(botao);
    tr.appendChild(tdAcao);

    return tr;
  }

  function paginasVisiveis(total, atual) {
    if (total <= 7) {
      var todas = [];
      for (var i = 1; i <= total; i++) todas.push(i);
      return todas;
    }
    var numeros = [1, total, atual - 1, atual, atual + 1].filter(function (n) {
      return n >= 1 && n <= total;
    }).filter(function (n, i, arr) { return arr.indexOf(n) === i; }).sort(function (a, b) { return a - b; });

    var saida = [];
    numeros.forEach(function (n, i) {
      if (i && n - numeros[i - 1] > 1) saida.push('…');
      saida.push(n);
    });
    return saida;
  }

  function botaoPagina(rotulo, pagina, desabilitado, titulo, ativo) {
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'pag-btn' + (ativo ? ' ativo' : '');
    botao.textContent = rotulo;
    botao.title = titulo;
    botao.dataset.pagina = pagina;
    botao.disabled = !!desabilitado;
    if (ativo) botao.setAttribute('aria-current', 'page');
    return botao;
  }

  function renderPaginacao(total, totalPaginas, inicio, naPagina) {
    var barra = document.getElementById('paginacao');
    if (!barra) return;

    if (!total) {
      barra.hidden = true;
      return;
    }
    barra.hidden = false;
    document.getElementById('pagInfo').textContent =
      'Mostrando ' + (inicio + 1) + '–' + (inicio + naPagina) + ' de ' + total + ' nota(s)';

    var nav = document.getElementById('pagPaginas');
    nav.textContent = '';
    nav.appendChild(botaoPagina('‹', state.pagina - 1, state.pagina === 1, 'Página anterior'));

    paginasVisiveis(totalPaginas, state.pagina).forEach(function (pagina) {
      if (pagina === '…') {
        var reticencias = document.createElement('span');
        reticencias.className = 'pag-reticencias';
        reticencias.textContent = '…';
        nav.appendChild(reticencias);
      } else {
        nav.appendChild(botaoPagina(String(pagina), pagina, false, 'Página ' + pagina, pagina === state.pagina));
      }
    });

    nav.appendChild(botaoPagina('›', state.pagina + 1, state.pagina === totalPaginas, 'Próxima página'));
  }

  function render() {
    var notas = filtradas();
    var validas = notas.filter(function (n) { return n.status !== 'cancelada'; });
    var corpo = document.getElementById('corpo');
    var rodape = document.getElementById('rodape');
    var vazio = document.getElementById('vazio');

    var totalPaginas = Math.max(1, Math.ceil(notas.length / state.porPagina));
    if (state.pagina > totalPaginas) state.pagina = totalPaginas;
    var inicio = (state.pagina - 1) * state.porPagina;
    var pagina = notas.slice(inicio, inicio + state.porPagina);

    corpo.textContent = '';
    rodape.textContent = '';

    if (!state.notas.length) {
      vazio.textContent = 'Nenhuma nota importada ainda. Selecione os XMLs ou uma pasta para começar.';
      vazio.hidden = false;
    } else if (!notas.length) {
      vazio.textContent = 'Nenhuma nota corresponde aos filtros.';
      vazio.hidden = false;
    } else {
      vazio.hidden = true;
    }

    pagina.forEach(function (n) { corpo.appendChild(linha(n)); });

    if (notas.length) {
      var totalServico = somar(validas, 'valorServico');
      var totalNota = somar(validas, 'valorTotal');
      var totalIss = somar(validas, 'valorIss');
      var totalInss = somar(validas, 'inss');

      var tr = document.createElement('tr');
      var rotulo = celula('Totais exibidos (sem canceladas)', 'rotulo');
      rotulo.colSpan = 4;
      tr.appendChild(rotulo);
      tr.appendChild(celula(formatarMoeda(totalServico), 'num'));
      tr.appendChild(celula(formatarMoeda(totalNota), 'num'));
      tr.appendChild(celula(''));
      tr.appendChild(celula(validas.filter(function (n) { return n.issRetido; }).length + ' Sim'));
      tr.appendChild(celula(formatarMoeda(totalIss), 'num'));
      tr.appendChild(celula(formatarMoeda(totalInss), 'num'));
      var vazioFinal = celula('');
      vazioFinal.colSpan = 3;
      tr.appendChild(vazioFinal);
      rodape.appendChild(tr);
    }

    document.getElementById('cardNotas').textContent = notas.length;
    document.getElementById('cardNotasDetalhe').textContent = 'de ' + state.notas.length + ' importadas';
    document.getElementById('cardServico').textContent = formatarMoeda(somar(validas, 'valorServico'));
    document.getElementById('cardIss').textContent = formatarMoeda(somar(validas, 'valorIss'));
    document.getElementById('cardIssRetido').textContent = formatarMoeda(
      validas.reduce(function (total, n) {
        return total + (n.issRetido ? (n.valorIssRetido == null ? n.valorIss : n.valorIssRetido) : 0);
      }, 0)
    );
    document.getElementById('cardInss').textContent = formatarMoeda(somar(validas, 'inss'));
    document.getElementById('cardServicoInss').textContent = formatarMoeda(
      somar(validas.filter(function (n) { return n.inss > 0; }), 'valorServico')
    );
    document.getElementById('cardCanceladas').textContent = notas.filter(function (n) { return n.status === 'cancelada'; }).length;

    var box = document.getElementById('ignoradosBox');
    if (state.ignorados.length) {
      box.hidden = false;
      document.getElementById('ignoradosResumo').textContent =
        state.ignorados.length + ' arquivo(s)/registro(s) ignorado(s)' +
        (state.ignorados.length > 100 ? ' (mostrando os últimos 100)' : '');
      var lista = document.getElementById('ignoradosLista');
      lista.textContent = '';
      state.ignorados.slice(-100).reverse().forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item.arquivo + ' — ' + item.motivo;
        lista.appendChild(li);
      });
    } else {
      box.hidden = true;
    }

    renderPaginacao(notas.length, totalPaginas, inicio, pagina.length);
  }

  // ---------- CSV ----------

  function campoCsv(valor) {
    var s = String(valor == null ? '' : valor);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function decimal(valor) {
    return valor.toFixed(2).replace('.', ',');
  }

  function exportarCsv() {
    var notas = filtradas();
    if (!notas.length) {
      mensagem('Nenhuma nota para exportar com os filtros atuais.', true);
      return;
    }

    var linhas = [[
      'Data de emissão', 'Nº NFS-e', 'Tomador do serviço', 'CNPJ / CPF', 'Atividade (CNAE)',
      'Item lista serviço', 'Valor do serviço', 'Valor total (líquido)', 'Alíquota (%)', 'ISS retido',
      'Valor ISS', 'INSS retido', 'Município favorecido', 'Código IBGE', 'UF', 'Situação',
      'Prestador', 'CNPJ prestador', 'Arquivo'
    ]];

    notas.forEach(function (n) {
      linhas.push([
        formatarData(n.dataIso), n.numero, n.tomador, formatarDocumento(n.cpfCnpj),
        n.atividade, n.item, decimal(n.valorServico), decimal(n.valorTotal),
        n.aliquota.toFixed(2).replace('.', ','), n.issRetido ? 'Sim' : 'Não',
        decimal(n.valorIss), decimal(n.inss), n.municipio, n.municipioCodigo, n.municipioUf,
        STATUS[n.status].rotulo, n.prestador, formatarDocumento(n.prestadorDoc), n.arquivo
      ]);
    });

    var csv = linhas.map(function (l) { return l.map(campoCsv).join(';'); }).join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var hoje = new Date();
    var dataArquivo = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');
    a.download = 'nfse-export-' + dataArquivo + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    mensagem(notas.length + ' nota(s) exportada(s) para CSV.');
  }

  // ---------- interface ----------

  function limpar() {
    if (!state.notas.length && !state.ignorados.length) return;
    if (!window.confirm('Remover todas as notas importadas?')) return;
    state.notas = [];
    state.ignorados = [];
    state.pagina = 1;
    document.getElementById('busca').value = '';
    document.getElementById('filtroStatus').value = '';
    document.getElementById('dataDe').value = '';
    document.getElementById('dataAte').value = '';
    mensagem('');
    render();
  }

  function ligarInterface() {
    var entradaArquivos = document.getElementById('inputArquivos');
    var entradaPasta = document.getElementById('inputPasta');
    var dropzone = document.getElementById('dropzone');
    var arrastando = 0;

    entradaArquivos.addEventListener('change', function (e) {
      importar(e.target.files);
      e.target.value = '';
    });

    entradaPasta.addEventListener('change', function (e) {
      importar(e.target.files);
      e.target.value = '';
    });

    document.getElementById('btnArquivos').addEventListener('click', function () { entradaArquivos.click(); });
    document.getElementById('btnPasta').addEventListener('click', function () { entradaPasta.click(); });

    dropzone.addEventListener('click', function (e) {
      if (e.target.closest('.btn')) return;
      entradaArquivos.click();
    });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entradaArquivos.click(); }
    });

    ['dragenter', 'dragover'].forEach(function (tipo) {
      dropzone.addEventListener(tipo, function (e) {
        e.preventDefault();
        if (tipo === 'dragenter') arrastando++;
        dropzone.classList.add('ativo');
      });
    });

    ['dragleave', 'dragend'].forEach(function (tipo) {
      dropzone.addEventListener(tipo, function (e) {
        e.preventDefault();
        if (--arrastando <= 0) { arrastando = 0; dropzone.classList.remove('ativo'); }
      });
    });

    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      arrastando = 0;
      dropzone.classList.remove('ativo');

      var itens = e.dataTransfer.items;
      if (itens && itens.length && itens[0].webkitGetAsEntry) {
        var entradas = [];
        for (var i = 0; i < itens.length; i++) {
          var entrada = itens[i].webkitGetAsEntry();
          if (entrada) entradas.push(entrada);
        }
        var arquivos = [];
        mensagem('Lendo pasta...');
        Promise.all(entradas.map(function (en) { return lerEntrada(en, arquivos); })).then(function () {
          importar(arquivos);
        });
      } else {
        importar(e.dataTransfer.files);
      }
    });

    [{ id: 'busca', evento: 'input' }, { id: 'filtroStatus', evento: 'change' },
      { id: 'dataDe', evento: 'change' }, { id: 'dataAte', evento: 'change' }].forEach(function (campo) {
      document.getElementById(campo.id).addEventListener(campo.evento, function () {
        state.pagina = 1;
        render();
      });
    });

    document.getElementById('porPagina').addEventListener('change', function (e) {
      state.porPagina = Number(e.target.value) || 15;
      state.pagina = 1;
      render();
    });

    document.getElementById('pagPaginas').addEventListener('click', function (e) {
      var botao = e.target.closest('.pag-btn');
      if (!botao || botao.disabled) return;
      state.pagina = Number(botao.dataset.pagina);
      render();
    });

    document.getElementById('btnCsv').addEventListener('click', exportarCsv);

    document.getElementById('btnImprimir').addEventListener('click', function () {
      var total = filtradas().length;
      if (!total) return;
      // imprime todas as notas filtradas, não só a página aberta
      var anterior = state.porPagina;
      state.porPagina = total;
      render();
      try { window.print(); } finally {
        state.porPagina = anterior;
        render();
      }
    });
    document.getElementById('btnLimpar').addEventListener('click', limpar);

    document.getElementById('corpo').addEventListener('click', function (e) {
      var botao = e.target.closest('.remover');
      if (!botao) return;
      var nota = state.notas.find(function (n) { return n.id === botao.dataset.id; });
      if (nota && !window.confirm('Remover a nota ' + (nota.numero || '') + ' (' + (nota.tomador || '') + ') da lista?')) return;
      state.notas = state.notas.filter(function (n) { return n.id !== botao.dataset.id; });
      render();
    });

    render();
  }

  window.NFSe = {
    parseXml: parseXml,
    parseXmls: parseXmls,
    mesclar: mesclar,
    campoCsv: campoCsv,
    lerConteudo: lerConteudo,
    formatarData: formatarData,
    formatarMoeda: formatarMoeda
  };

  if (document.getElementById('inputArquivos')) ligarInterface();
})();
