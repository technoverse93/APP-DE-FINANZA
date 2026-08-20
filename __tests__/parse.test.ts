import {
  decodeEncodedWords,
  decodeQuotedPrintable,
  detectarBanco,
  esDelBac,
  extraerMonto,
  htmlATexto,
  parseMontoCR,
  parsearCorreo,
  type CorreoCrudo,
} from '../supabase/functions/_shared/parse';

const base: CorreoCrudo = {
  messageId: '<abc@bancobcr.com>',
  from: 'notificaciones@bancobcr.com',
  subject: 'Comprobante de transferencia SINPE',
  body: 'Se realizó una transferencia por ₡25,000.00. Referencia: 998877',
  date: new Date('2026-08-20T14:30:00Z'),
};

describe('filtro del BAC', () => {
  it('descarta por dominio del remitente', () => {
    expect(esDelBac({ from: 'avisos@baccredomatic.com', subject: '', body: '' })).toBe(true);
  });

  it('descarta por mención en el asunto', () => {
    expect(esDelBac({ from: 'x@y.com', subject: 'BAC Credomatic aviso', body: '' })).toBe(true);
  });

  it('descarta por mención en el cuerpo', () => {
    expect(esDelBac({ from: 'x@y.com', subject: '', body: 'Su tarjeta BAC San José' })).toBe(true);
  });

  it('no confunde palabras que contienen las letras bac', () => {
    expect(esDelBac({ from: 'x@y.com', subject: 'BACKUP', body: 'tabaco y bacalao' })).toBe(false);
  });

  it('el descarte del BAC gana sobre cualquier otra señal', () => {
    // Correo que menciona BCR y SINPE pero viene del BAC.
    const r = parsearCorreo({
      ...base,
      from: 'notificaciones@baccredomatic.com',
      body: 'Transferencia SINPE del Banco de Costa Rica por ₡25,000.00',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('bac_excluido');
  });
});

describe('detectarBanco', () => {
  it('reconoce el BCR por dominio', () => {
    expect(detectarBanco({ from: 'x@bancobcr.com', subject: '', body: '' })).toBe('BCR');
  });

  it('reconoce el BCR por nombre completo', () => {
    expect(detectarBanco({ from: 'x@y.com', subject: 'Banco de Costa Rica', body: '' })).toBe('BCR');
  });

  it('reconoce SINPE cuando no hay banco identificable', () => {
    expect(detectarBanco({ from: 'x@y.com', subject: 'SINPE Móvil', body: '' })).toBe('SINPE');
  });

  it('devuelve DESCONOCIDO para correo ajeno', () => {
    expect(detectarBanco({ from: 'x@y.com', subject: 'Promoción', body: 'Hola' })).toBe(
      'DESCONOCIDO',
    );
  });
});

describe('parseMontoCR', () => {
  it('interpreta coma de miles con punto decimal', () => {
    expect(parseMontoCR('25,000.50')).toBe(25000.5);
  });

  it('interpreta punto de miles con coma decimal', () => {
    expect(parseMontoCR('25.000,50')).toBe(25000.5);
  });

  it('trata un separador único de tres dígitos como miles', () => {
    expect(parseMontoCR('25,000')).toBe(25000);
    expect(parseMontoCR('25.000')).toBe(25000);
  });

  it('trata un separador único de dos dígitos como decimal', () => {
    expect(parseMontoCR('25,50')).toBe(25.5);
    expect(parseMontoCR('25.50')).toBe(25.5);
  });

  it('maneja millones con múltiples separadores de miles', () => {
    expect(parseMontoCR('1,250,000.00')).toBe(1250000);
    expect(parseMontoCR('1.250.000,00')).toBe(1250000);
  });

  it('devuelve null si no hay dígitos', () => {
    expect(parseMontoCR('sin monto')).toBeNull();
  });
});

describe('extraerMonto', () => {
  it('reconoce el símbolo de colón antepuesto', () => {
    expect(extraerMonto('un cargo de ₡25,000.00 hoy')).toEqual({ monto: 25000, moneda: 'CRC' });
  });

  it('reconoce el código CRC', () => {
    expect(extraerMonto('monto CRC 8.500,00')).toEqual({ monto: 8500, moneda: 'CRC' });
  });

  it('reconoce la palabra colones pospuesta', () => {
    expect(extraerMonto('12,300 colones')).toEqual({ monto: 12300, moneda: 'CRC' });
  });

  it('reconoce dólares', () => {
    expect(extraerMonto('cargo por $150.00')).toEqual({ monto: 150, moneda: 'USD' });
  });

  it('prefiere colones cuando aparecen ambas monedas', () => {
    expect(extraerMonto('₡25,000.00 equivalente a $48.00')).toEqual({
      monto: 25000,
      moneda: 'CRC',
    });
  });

  it('devuelve null cuando no hay monto', () => {
    expect(extraerMonto('Su clave fue actualizada')).toBeNull();
  });
});

describe('decodificación MIME', () => {
  it('decodifica quoted-printable con acentos', () => {
    expect(decodeQuotedPrintable('Transferencia realiz=C3=B3')).toBe('Transferencia realizó');
  });

  it('une líneas partidas por soft break', () => {
    expect(decodeQuotedPrintable('mon=\r\nto')).toBe('monto');
  });

  it('decodifica encoded-words en base64', () => {
    expect(decodeEncodedWords('=?UTF-8?B?Q29tcHJvYmFudGU=?=')).toBe('Comprobante');
  });

  it('decodifica encoded-words en quoted-printable', () => {
    expect(decodeEncodedWords('=?UTF-8?Q?Transacci=C3=B3n?=')).toBe('Transacción');
  });

  it('convierte HTML a texto conservando saltos', () => {
    const html = '<p>Monto: ₡25,000.00</p><p>Referencia: 998877</p>';
    expect(htmlATexto(html)).toBe('Monto: ₡25,000.00\nReferencia: 998877');
  });

  it('descarta el contenido de script y style', () => {
    expect(htmlATexto('<style>p{color:red}</style><p>Hola</p>')).toBe('Hola');
  });
});

describe('parsearCorreo', () => {
  it('extrae un comprobante completo del BCR', () => {
    const r = parsearCorreo(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comprobante.banco).toBe('BCR');
    expect(r.comprobante.monto).toBe(25000);
    expect(r.comprobante.moneda).toBe('CRC');
    expect(r.comprobante.referencia).toBe('998877');
    expect(r.comprobante.ocurridoEn).toEqual(base.date);
  });

  it('extrae la contraparte cuando el correo la declara', () => {
    const r = parsearCorreo({
      ...base,
      body: 'Transferencia por ₡25,000.00\nPara: JUAN PEREZ MORA\nReferencia: 12345',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.comprobante.contraparte).toBe('JUAN PEREZ MORA');
  });

  it('rechaza correo sin monto', () => {
    const r = parsearCorreo({ ...base, subject: 'Aviso BCR', body: 'Su clave fue actualizada' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('sin_monto');
  });

  it('rechaza correo de banco no reconocido', () => {
    const r = parsearCorreo({
      ...base,
      from: 'promos@tienda.com',
      subject: 'Oferta',
      body: 'Llevá esto por ₡25,000.00',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('banco_no_reconocido');
  });

  it('rechaza monto cero', () => {
    const r = parsearCorreo({ ...base, body: 'Transferencia por ₡0.00' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('monto_invalido');
  });
});
