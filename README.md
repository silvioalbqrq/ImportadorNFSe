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
| Situação | `SituacaoAdn`, bloco `Cancelamento` e `NfseSubstituida` |

No layout nacional (`sped.fazenda.gov.br/nfse`), os campos vêm de `NFSe/infNFSe` e da `DPS/infDPS`: número em `nNFSe`, data em `dhEmi`, tomador em `toma`, valores em `valores/vServPrest/vServ` e `valores/vLiq`, ISS em `valores/vISSQN` e retenção em `trib/tribMun/tpRetISSQN`. A situação usa `cStat`.

## Detalhes fiscais (NFS-e nacional)

As notas do layout nacional têm um botão **Detalhes** na listagem. Ele abre um painel com as tags fiscais lidas da DPS, sem criar novas colunas na tabela:

| Campo | Origem no XML |
| --- | --- |
| Regime (`opSimpNac`) | `DPS/infDPS/prest/regTrib/opSimpNac` |
| Apuração Simples (`regApTribSN`) | `DPS/infDPS/prest/regTrib/regApTribSN` |
| Regime especial (`regEspTrib`) | `DPS/infDPS/prest/regTrib/regEspTrib` |
| Tributos aproximados do Simples (`pTotTribSN`) | `DPS/infDPS/valores/trib/totTrib/pTotTribSN` |
| Indicador total de tributos (`indTotTrib`) | `DPS/infDPS/valores/trib/totTrib/indTotTrib` |
| Valor total de tributos (`vTotTrib`) | `DPS/infDPS/valores/trib/totTrib/vTotTrib` |
| CST PIS/COFINS (`CST`) | `DPS/infDPS/valores/trib/tribFed/piscofins/CST` |
| Retenção PIS/COFINS (`tpRetPisCofins`) | `DPS/infDPS/valores/trib/tribFed/piscofins/tpRetPisCofins` |
| Alíquota PIS (`pAliqPis`) | `DPS/infDPS/valores/trib/tribFed/piscofins/pAliqPis` |
| Alíquota COFINS (`pAliqCofins`) | `DPS/infDPS/valores/trib/tribFed/piscofins/pAliqCofins` |
| Base PIS/COFINS (`vBCPisCofins`) | `DPS/infDPS/valores/trib/tribFed/piscofins/vBCPisCofins` |
| Valor PIS (`vPis`) | `DPS/infDPS/valores/trib/tribFed/piscofins/vPis` |
| Valor COFINS (`vCofins`) | `DPS/infDPS/valores/trib/tribFed/piscofins/vCofins` |
| Alíquota ISS (`pAliq`) | `DPS/infDPS/valores/trib/tribMun/pAliq` |
| Alíquota aplicada (`pAliqAplic`) | `NFSe/infNFSe/valores/pAliqAplic` |
| Modelo NF/NFS (`modNFS`) | `DPS/infDPS/valores/vDedRed/documentos/docDedRed/NFNFS/modNFS` |

Os códigos são exibidos com o rótulo oficial (por exemplo, `opSimpNac` `3` aparece como “3 - ME/EPP”). Campos ausentes aparecem como “—”. O painel só é mostrado quando a nota tem algum desses campos; notas GINFES não têm o botão.

`modNFS` não é o modelo geral da nota: ele só existe dentro de documento de dedução/reembolso (`vDedRed`) e, por isso, aparece apenas quando esse grupo está no XML.

As mesmas tags são incluídas no CSV exportado. Os campos de IBS/CBS (grupo `IBSCBS`, previsto para 01/12/2026) ainda não são lidos.

## Situação da nota

- **Cancelada**: existe `Cancelamento/Confirmacao/InfConfirmacaoCancelamento` com `Sucesso=true`.
- **Em processamento**: `SituacaoAdn` = `Em Processamento`.
- **Processada**: `SituacaoAdn` = `Processado com Sucesso`.
- **Substituída**: outra nota da lista informa tê-la substituído — `NfseSubstituida` (número) no GINFES ou `subst/chSubstda` (chave) no layout nacional. A substituição tem prioridade sobre o cancelamento, pois o XML da nota antiga costuma vir com bloco de cancelamento.
- **Não informado**: XML antigo sem `SituacaoAdn` e sem cancelamento.

Notas canceladas e substituídas não entram nos totais. Os cards e o rodapé refletem os filtros aplicados.

## Duplicidades

O mesmo XML importado duas vezes (inclusive em pastas diferentes, como `01` e `01/originais`) é contado uma única vez pela `ChaveAcesso` — ou, no layout antigo, por prestador + número + data. No layout nacional, vale o `Id` do `infNFSe`. Quando há versões diferentes da mesma nota, vale a de maior prioridade: cancelada > processada > não informada > em processamento.

## Layouts suportados

- GINFES/Fortaleza com `NFSE > Nfse > InfNfse` (layout novo, com `SituacaoAdn`).
- GINFES/Fortaleza com `NFSE > Nfse` e `IdentificacaoNfse` (layout antigo).
- NFS-e nacional do Portal Contribuinte (`NFSe > infNFSe`, `sped.fazenda.gov.br/nfse`).

NF-e de produto e outros padrões de NFS-e não são lidos; os arquivos são listados como ignorados.

## Testes

Abra `testes.html` no navegador. Ele roda 19 casos dos três layouts, cancelamento, processamento, substituição, duplicidade, CSV, tags fiscais nacionais e arquivo inválido, e mostra “Todos os casos passaram” quando está tudo certo.

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
