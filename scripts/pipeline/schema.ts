import fs from 'node:fs'
import path from 'node:path'
import { SCHEMA_DIR } from './config.ts'

/** The 47 source columns, in order, exactly as published (typo included — DEF-01). */
export const RAW_HEADER: readonly string[] = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'raw-header.v1.json'), 'utf8'))

const col = (name: string) => {
  const i = RAW_HEADER.indexOf(name)
  if (i < 0) throw new Error(`schema: column "${name}" not in raw-header.v1.json`)
  return i
}

/** Column indexes into a raw row (string[47]). */
export const C = {
  period: col('Ano e mês do lançamento'),
  orgSupCode: col('Código Órgão Superior'),
  orgSupName: col('Nome Órgão Superior'),
  orgSubCode: col('Código Órgão Subordinado'),
  orgSubName: col('Nome Órgão Subordinado'),
  ugCode: col('Código Unidade Gestora'),
  ugName: col('Nome Unidade Gestora'),
  gestaoCode: col('Código Gestão'),
  gestaoName: col('Nome Gestão'),
  uoCode: col('Código Unidade Orçamentária'),
  uoName: col('Nome Unidade Orçamentária'),
  funcaoCode: col('Código Função'),
  funcaoName: col('Nome Função'),
  subfuncaoCode: col('Código Subfução'),
  subfuncaoName: col('Nome Subfunção'),
  programaCode: col('Código Programa Orçamentário'),
  programaName: col('Nome Programa Orçamentário'),
  acaoCode: col('Código Ação'),
  acaoName: col('Nome Ação'),
  poCode: col('Código Plano Orçamentário'),
  poName: col('Plano Orçamentário'),
  progGovCode: col('Código Programa Governo'),
  progGovName: col('Nome Programa Governo'),
  uf: col('UF'),
  municipio: col('Município'),
  subtituloCode: col('Código Subtítulo'),
  subtituloName: col('Nome Subtítulo'),
  localizadorCode: col('Código Localizador'),
  localizadorName: col('Nome Localizador'),
  localizadorSigla: col('Sigla Localizador'),
  localizadorDescr: col('Descrição Complementar Localizador'),
  autorCode: col('Código Autor Emenda'),
  autorName: col('Nome Autor Emenda'),
  catCode: col('Código Categoria Econômica'),
  catName: col('Nome Categoria Econômica'),
  grupoCode: col('Código Grupo de Despesa'),
  grupoName: col('Nome Grupo de Despesa'),
  elementoCode: col('Código Elemento de Despesa'),
  elementoName: col('Nome Elemento de Despesa'),
  modalidadeCode: col('Código Modalidade da Despesa'),
  modalidadeName: col('Modalidade da Despesa'),
  empenhado: col('Valor Empenhado (R$)'),
  liquidado: col('Valor Liquidado (R$)'),
  pago: col('Valor Pago (R$)'),
  rpInscritos: col('Valor Restos a Pagar Inscritos (R$)'),
  rpCancelado: col('Valor Restos a Pagar Cancelado (R$)'),
  rpPagos: col('Valor Restos a Pagar Pagos (R$)'),
} as const

export const VALUE_COLS = [C.empenhado, C.liquidado, C.pago, C.rpInscritos, C.rpCancelado, C.rpPagos] as const

/** Every free-text name column (whitespace and encoding rules apply to all of them). */
export const NAME_COLS = [
  C.orgSupName, C.orgSubName, C.ugName, C.gestaoName, C.uoName, C.funcaoName, C.subfuncaoName,
  C.programaName, C.acaoName, C.poName, C.progGovName, C.municipio, C.subtituloName, C.localizadorName,
  C.localizadorDescr, C.autorName, C.catName, C.grupoName, C.elementoName, C.modalidadeName,
] as const

export const name = (i: number) => RAW_HEADER[i]

/**
 * A row in flight through the pipeline. `f` is the raw string fields (mutated
 * by rules), `v` the six money columns parsed to integer centavos.
 */
export interface Row {
  f: string[]
  v: Float64Array
  year: number
  month: number
  period: string
}
