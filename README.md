# Importador de NFS-e

Site local (HTML/CSS/JS, sem servidor e sem dependências) para importar XMLs de notas fiscais de serviços por **arquivo** ou por **pasta** e gerar uma listagem exportável em CSV.

Todo o processamento acontece no navegador. Nenhum XML é enviado para a internet.

## Como usar

1. Abra o `index.html` no navegador (duplo clique já funciona).
2. Use **Importar arquivos**, **Importar pasta** ou arraste os XMLs/pasta para a área tracejada.
3. Filtre por tomador, número, situação ou período de emissão.
4. Escolha 15, 25, 50 ou 100 notas por página e navegue pelas páginas.
5. Clique em **Exportar CSV** para abrir no Excel (exporta todas as notas filtradas, não só a página atual).
6. Clique em **Imprimir** para gerar o relatório em A4 paisagem com os cards compactos e todas as notas filtradas.

Subpastas são lidas. Arquivos que não são NFS-e aparecem em “arquivos ignorados”, sem interromper a importação.

## Campos reconhecidos

| Campo | Origem no XML |
| --- | --- |
| Data de emissão | `DataEmissao` |
| Número da nota | `Numero` |
| Tomador do serviço | `TomadorServico/RazaoSocial` |
| CNPJ / CPF do tomador | `TomadorServico/IdentificacaoTomador/CpfCnpj` |
| Atividade | `Servico/CodigoCnae` (ou `CodigoTributacaoMunicipio`), com o item da lista de serviço |
| Valor do serviço | `Servico/Valores/ValorServicos` |
| Valor total (líquido) | `Servico/Valores/ValorLiquidoNfse` |
| Alíquota | `Servico/Valores/Aliquota` |
| ISS retido (Sim/Não) | `Servico/Valores/IssRetido` (`1` = Sim, `2` = Não) |
| Valor do ISS | `Servico/Valores/ValorIss` |
| INSS retido | `Servico/Valores/ValorInss` |
| Município favorecido | `Servico/CodigoMunicipio` / `OrgaoGerador/CodigoMunicipio`, com nome e UF da tabela do IBGE |
| Situação | `SituacaoAdn` e bloco `Cancelamento` |

No layout nacional (`sped.fazenda.gov.br/nfse`), os campos vêm de `NFSe/infNFSe` e da `DPS/infDPS`: número em `nNFSe`, data em `dhEmi`, tomador em `toma`, valores em `valores/vServPrest/vServ` e `valores/vLiq`, ISS em `valores/vISSQN` e retenção em `trib/tribMun/tpRetISSQN`. A situação usa `cStat`.

## Situação da nota

- **Cancelada**: existe `Cancelamento/Confirmacao/InfConfirmacaoCancelamento` com `Sucesso=true`.
- **Em processamento**: `SituacaoAdn` = `Em Processamento`.
- **Processada**: `SituacaoAdn` = `Processado com Sucesso`.
- **Não informado**: XML antigo sem `SituacaoAdn` e sem cancelamento.

Notas canceladas não entram nos totais. Os cards e o rodapé refletem os filtros aplicados.

## Duplicidades

O mesmo XML importado duas vezes (inclusive em pastas diferentes, como `01` e `01/originais`) é contado uma única vez pela `ChaveAcesso` — ou, no layout antigo, por prestador + número + data. No layout nacional, vale o `Id` do `infNFSe`. Quando há versões diferentes da mesma nota, vale a de maior prioridade: cancelada > processada > não informada > em processamento.

## Layouts suportados

- GINFES/Fortaleza com `NFSE > Nfse > InfNfse` (layout novo, com `SituacaoAdn`).
- GINFES/Fortaleza com `NFSE > Nfse` e `IdentificacaoNfse` (layout antigo).
- NFS-e nacional do Portal Contribuinte (`NFSe > infNFSe`, `sped.fazenda.gov.br/nfse`).

NF-e de produto e outros padrões de NFS-e não são lidos; os arquivos são listados como ignorados.

## Testes

Abra `testes.html` no navegador. Ele roda casos dos três layouts, cancelamento, processamento, duplicidade, CSV e arquivo inválido, e mostra “Todos os casos passaram” quando está tudo certo.

## Publicar no GitHub

```bash
cd importador-nfse
git init
git add .
git commit -m "Importador de NFS-e"
gh repo create importador-nfse --public --source=. --push
```

Depois, em **Settings > Pages**, selecione a branch `main` e a pasta `/ (root)`. O site funciona como página estática, sem backend.

## Limitações

- O CSV usa `;` como separador e vírgula decimal, no padrão do Excel em português.
- A lista de municípios vem da API de localidades do IBGE e está embutida em `municipios.js` (funciona offline).
- Notas ficam apenas na memória da página: recarregar limpa a lista.
