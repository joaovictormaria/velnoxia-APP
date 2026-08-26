import { describe, it, expect } from "vitest";
import {
  documentoCompleto,
  formatDocumentInput,
  posicaoDoCursorAposMascara,
  normalizeDocument,
  detectDocumentType,
  validateCPF,
  validateCNPJ,
  validateDocument,
  formatDocument,
  maskDocument,
} from "../document";

/*
 * Os documentos usados aqui foram gerados pela propria conta de digito
 * verificador, e nao copiados de uma lista: um "CPF valido" errado faz o teste
 * passar a mentir na primeira vez que alguem mexer no algoritmo.
 *
 * Sao numeros sinteticos — nao pertencem a ninguem.
 */
const CPF_VALIDO = "11144477735";
const CPF_VALIDO_2 = "52998224725";
const CNPJ_VALIDO = "11222333000181";
const CNPJ_VALIDO_2 = "11345678000122";

describe("normalizeDocument", () => {
  it("remove pontos, traco e barra", () => {
    expect(normalizeDocument("111.444.777-35")).toBe(CPF_VALIDO);
    expect(normalizeDocument("11.222.333/0001-81")).toBe(CNPJ_VALIDO);
  });

  it("remove espacos, inclusive no meio", () => {
    expect(normalizeDocument("  111 444 777 35  ")).toBe(CPF_VALIDO);
  });

  it("nao altera o que ja e so digito", () => {
    expect(normalizeDocument(CPF_VALIDO)).toBe(CPF_VALIDO);
  });

  it("devolve string vazia para null e undefined", () => {
    expect(normalizeDocument(null)).toBe("");
    expect(normalizeDocument(undefined)).toBe("");
    expect(normalizeDocument("")).toBe("");
  });

  it("descarta letras em vez de aceita-las como digito", () => {
    expect(normalizeDocument("111abc444def77735")).toBe(CPF_VALIDO);
  });
});

describe("detectDocumentType", () => {
  it("11 digitos e CPF", () => {
    expect(detectDocumentType(CPF_VALIDO)).toBe("CPF");
    expect(detectDocumentType("111.444.777-35")).toBe("CPF");
  });

  it("14 digitos e CNPJ", () => {
    expect(detectDocumentType(CNPJ_VALIDO)).toBe("CNPJ");
    expect(detectDocumentType("11.222.333/0001-81")).toBe("CNPJ");
  });

  it("qualquer outro tamanho e null, sem chute", () => {
    expect(detectDocumentType("1114447773")).toBeNull();
    expect(detectDocumentType("111444777351")).toBeNull();
    expect(detectDocumentType("")).toBeNull();
    expect(detectDocumentType(null)).toBeNull();
  });
});

describe("validateCPF", () => {
  it("aceita CPF valido sem mascara", () => {
    expect(validateCPF(CPF_VALIDO)).toEqual({
      valido: true,
      documento: CPF_VALIDO,
      tipo: "CPF",
    });
  });

  it("aceita CPF valido com mascara e devolve normalizado", () => {
    expect(validateCPF("111.444.777-35")).toEqual({
      valido: true,
      documento: CPF_VALIDO,
      tipo: "CPF",
    });
  });

  it("aceita CPF valido com espacos", () => {
    const r = validateCPF(" 111.444.777-35 ");
    expect(r.valido).toBe(true);
    expect(r.valido && r.documento).toBe(CPF_VALIDO);
  });

  it("recusa CPF com digito verificador errado", () => {
    expect(validateCPF("11144477734")).toEqual({
      valido: false,
      erro: "VERIFICADOR_INVALIDO",
    });
  });

  it("recusa CPF incompleto", () => {
    expect(validateCPF("1114447773")).toEqual({
      valido: false,
      erro: "TAMANHO_INVALIDO",
    });
  });

  it("recusa sequencia de digitos repetidos", () => {
    for (const d of ["00000000000", "11111111111", "99999999999"]) {
      expect(validateCPF(d)).toEqual({ valido: false, erro: "DIGITOS_REPETIDOS" });
    }
  });

  it("recusa vazio", () => {
    expect(validateCPF("")).toEqual({ valido: false, erro: "VAZIO" });
    expect(validateCPF(null)).toEqual({ valido: false, erro: "VAZIO" });
  });

  it("recusa um CNPJ valido, porque nao e CPF", () => {
    expect(validateCPF(CNPJ_VALIDO)).toEqual({
      valido: false,
      erro: "TAMANHO_INVALIDO",
    });
  });
});

describe("validateCNPJ", () => {
  it("aceita CNPJ valido sem mascara", () => {
    expect(validateCNPJ(CNPJ_VALIDO)).toEqual({
      valido: true,
      documento: CNPJ_VALIDO,
      tipo: "CNPJ",
    });
  });

  it("aceita CNPJ valido com mascara e devolve normalizado", () => {
    expect(validateCNPJ("11.222.333/0001-81")).toEqual({
      valido: true,
      documento: CNPJ_VALIDO,
      tipo: "CNPJ",
    });
  });

  it("recusa CNPJ com digito verificador errado", () => {
    expect(validateCNPJ("11222333000182")).toEqual({
      valido: false,
      erro: "VERIFICADOR_INVALIDO",
    });
  });

  it("recusa CNPJ incompleto", () => {
    expect(validateCNPJ("1122233300018")).toEqual({
      valido: false,
      erro: "TAMANHO_INVALIDO",
    });
  });

  it("recusa sequencia de digitos repetidos", () => {
    for (const d of ["00000000000000", "11111111111111"]) {
      expect(validateCNPJ(d)).toEqual({ valido: false, erro: "DIGITOS_REPETIDOS" });
    }
  });

  it("recusa vazio", () => {
    expect(validateCNPJ("")).toEqual({ valido: false, erro: "VAZIO" });
  });

  it("recusa um CPF valido, porque nao e CNPJ", () => {
    expect(validateCNPJ(CPF_VALIDO)).toEqual({
      valido: false,
      erro: "TAMANHO_INVALIDO",
    });
  });
});

describe("validateDocument", () => {
  it("identifica CPF sozinho, sem receber o tipo", () => {
    expect(validateDocument("111.444.777-35")).toEqual({
      valido: true,
      documento: CPF_VALIDO,
      tipo: "CPF",
    });
  });

  it("identifica CNPJ sozinho, sem receber o tipo", () => {
    expect(validateDocument("11.222.333/0001-81")).toEqual({
      valido: true,
      documento: CNPJ_VALIDO,
      tipo: "CNPJ",
    });
  });

  it("recusa tamanho que nao e nem CPF nem CNPJ", () => {
    expect(validateDocument("123456789012")).toEqual({
      valido: false,
      erro: "TAMANHO_INVALIDO",
    });
  });

  it("recusa vazio, null e so pontuacao", () => {
    expect(validateDocument("")).toEqual({ valido: false, erro: "VAZIO" });
    expect(validateDocument(null)).toEqual({ valido: false, erro: "VAZIO" });
    expect(validateDocument("...---///")).toEqual({ valido: false, erro: "VAZIO" });
  });

  it("recusa texto livre", () => {
    expect(validateDocument("meu documento").valido).toBe(false);
  });

  it("a saida e sempre so digito quando valida", () => {
    const entradas = [
      "111.444.777-35",
      " 111 444 777 35 ",
      CPF_VALIDO,
      "11.222.333/0001-81",
    ];
    for (const e of entradas) {
      const r = validateDocument(e);
      expect(r.valido).toBe(true);
      if (r.valido) expect(r.documento).toMatch(/^[0-9]+$/);
    }
  });
});

describe("formatDocument", () => {
  it("formata CPF", () => {
    expect(formatDocument(CPF_VALIDO)).toBe("111.444.777-35");
  });

  it("formata CNPJ", () => {
    expect(formatDocument(CNPJ_VALIDO)).toBe("11.222.333/0001-81");
  });

  it("ida e volta: formatar e normalizar devolve o original", () => {
    for (const d of [CPF_VALIDO, CPF_VALIDO_2, CNPJ_VALIDO, CNPJ_VALIDO_2]) {
      expect(normalizeDocument(formatDocument(d))).toBe(d);
    }
  });

  it("devolve a entrada quando o tamanho nao bate, em vez de quebrar", () => {
    expect(formatDocument("123")).toBe("123");
    expect(formatDocument(null)).toBe("");
  });
});

describe("maskDocument", () => {
  it("CPF mostra so os cinco ultimos digitos", () => {
    expect(maskDocument(CPF_VALIDO)).toBe("***.***.777-35");
  });

  it("CNPJ mostra so o verificador", () => {
    expect(maskDocument(CNPJ_VALIDO)).toBe("**.***.***/****-81");
  });

  it("aceita entrada ja mascarada", () => {
    expect(maskDocument("111.444.777-35")).toBe("***.***.777-35");
  });

  it("nunca deixa vazar o documento inteiro", () => {
    for (const d of [CPF_VALIDO, CPF_VALIDO_2, CNPJ_VALIDO, CNPJ_VALIDO_2]) {
      expect(maskDocument(d)).not.toContain(d);
      expect(maskDocument(d)).not.toContain(d.slice(0, 6));
    }
  });

  it("entrada invalida vira asteriscos em vez de vazar o que veio", () => {
    expect(maskDocument("123")).toBe("***");
    expect(maskDocument(null)).toBe("***");
    expect(maskDocument("texto secreto")).toBe("***");
  });
});

describe("formatDocumentInput (mascara enquanto digita)", () => {
  it("monta a mascara de CPF digito a digito", () => {
    expect(formatDocumentInput("1")).toBe("1");
    expect(formatDocumentInput("123")).toBe("123");
    expect(formatDocumentInput("1234")).toBe("123.4");
    expect(formatDocumentInput("123456")).toBe("123.456");
    expect(formatDocumentInput("1234567")).toBe("123.456.7");
    expect(formatDocumentInput("123456789")).toBe("123.456.789");
    expect(formatDocumentInput("1234567890")).toBe("123.456.789-0");
    expect(formatDocumentInput("12345678909")).toBe("123.456.789-09");
  });

  it("troca de CPF para CNPJ no 12o digito", () => {
    expect(formatDocumentInput("12345678000")).toBe("123.456.780-00");
    expect(formatDocumentInput("123456780001")).toBe("12.345.678/0001");
  });

  it("monta a mascara de CNPJ ate o fim", () => {
    expect(formatDocumentInput("1234567800019")).toBe("12.345.678/0001-9");
    expect(formatDocumentInput("12345678000195")).toBe("12.345.678/0001-95");
  });

  it("descarta digitos alem de 14", () => {
    expect(formatDocumentInput("123456780001959999")).toBe("12.345.678/0001-95");
  });

  it("aceita colagem ja mascarada sem duplicar separador", () => {
    expect(formatDocumentInput("111.444.777-35")).toBe("111.444.777-35");
    expect(formatDocumentInput("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });

  it("aceita colagem com espacos e com letras no meio", () => {
    expect(formatDocumentInput(" 111 444 777 35 ")).toBe("111.444.777-35");
    expect(formatDocumentInput("11a1b444777c35")).toBe("111.444.777-35");
  });

  it("vazio continua vazio", () => {
    expect(formatDocumentInput("")).toBe("");
    expect(formatDocumentInput(null)).toBe("");
    expect(formatDocumentInput("abc")).toBe("");
  });

  it("o que sai, normalizado, e o que entrou", () => {
    for (const d of ["1", "1234567", CPF_VALIDO, "123456780001", CNPJ_VALIDO]) {
      expect(normalizeDocument(formatDocumentInput(d))).toBe(d);
    }
  });
});

describe("documentoCompleto", () => {
  it("so e completo com 11 ou 14 digitos", () => {
    expect(documentoCompleto("1234567890")).toBe(false);
    expect(documentoCompleto(CPF_VALIDO)).toBe(true);
    expect(documentoCompleto("123456789012")).toBe(false);
    expect(documentoCompleto(CNPJ_VALIDO)).toBe(true);
  });

  it("nao confunde invalido com incompleto", () => {
    // 11 digitos com verificador errado: completo, porem invalido.
    expect(documentoCompleto("11144477734")).toBe(true);
    expect(validateDocument("11144477734").valido).toBe(false);
  });

  it("vazio nao e completo", () => {
    expect(documentoCompleto("")).toBe(false);
    expect(documentoCompleto(null)).toBe(false);
  });
});

describe("posicaoDoCursorAposMascara", () => {
  const pos = posicaoDoCursorAposMascara;

  it("digitando no fim, o cursor fica no fim", () => {
    // "123" -> "123", cursor depois do 3o digito
    expect(pos("123", 3, "123")).toBe(3);
    // "1234" -> "123.4", cursor depois do 4o digito (que vem apos o ponto)
    expect(pos("1234", 4, "123.4")).toBe(5);
  });

  it("pula o separador que a mascara acabou de inserir", () => {
    // ao completar o 3o digito, o ponto entra e o cursor tem que ficar depois
    expect(pos("123", 3, "123")).toBe(3);
    expect(pos("1234567", 7, "123.456.7")).toBe(9);
  });

  it("editando no MEIO do texto, o cursor segue o digito", () => {
    // "111.444.777-35", cursor logo apos o 2o digito
    // 2 digitos antes -> posicao 2 no formatado
    expect(pos("111.444.777-35", 2, "111.444.777-35")).toBe(2);
    // cursor apos o 5o digito: "111.44|4.777-35" -> indice 6
    expect(pos("111.444.777-35", 6, "111.444.777-35")).toBe(6);
  });

  it("cursor no inicio continua no inicio", () => {
    expect(pos("111.444.777-35", 0, "111.444.777-35")).toBe(0);
    expect(pos("", 0, "")).toBe(0);
  });

  it("colagem completa leva o cursor para o fim", () => {
    const bruto = "11144477735";
    const fmt = "111.444.777-35";
    expect(pos(bruto, bruto.length, fmt)).toBe(fmt.length);
  });

  it("na troca de CPF para CNPJ o cursor nao se perde", () => {
    // 12o digito: a mascara inteira se remonta
    const digitado = "123.456.780-001";
    const fmt = "12.345.678/0001";
    // 12 digitos antes do cursor -> fim do formatado
    expect(pos(digitado, digitado.length, fmt)).toBe(fmt.length);
  });

  it("nunca devolve posicao alem do texto", () => {
    const fmt = "123.456.789-09";
    for (let i = 0; i <= 20; i++) {
      const p = pos("12345678909", i, fmt);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(fmt.length);
    }
  });
});
