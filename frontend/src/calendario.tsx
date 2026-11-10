import { useId, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ptBR } from 'react-day-picker/locale';
import 'react-day-picker/style.css';

const formatoData = new Intl.DateTimeFormat('sv-SE');
export const dataLocalISO = (dia = new Date()) => formatoData.format(dia).padStart(10, '0');

export function CampoData({ rotulo, name, defaultValue, required }: {
  rotulo: string; name: string; defaultValue?: string; required?: boolean;
}) {
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const calendario = useRef<HTMLDivElement>(null);
  const [valor, definirValor] = useState<string | null>(null);
  const selecionado = valor?.length === 10 ? new Date(`${valor}T12:00:00`) : undefined;

  function escolher(dia?: Date) {
    if (campo.current) campo.current.value = dia ? dataLocalISO(dia) : '';
    calendario.current?.hidePopover();
  }

  return <div className="campo">
    <label htmlFor={id}>{rotulo}</label>
    <div className="controle-data">
      <input id={id} ref={campo} name={name} type="date" min="0001-01-01" max="9999-12-31"
        defaultValue={defaultValue} required={required} />
      <button className="abrir-calendario" type="button" popoverTarget={`${id}-calendario`}
        aria-label={`Abrir calendário de ${rotulo.toLowerCase()}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16" />
        </svg>
      </button>
      <div className="calendario" id={`${id}-calendario`} ref={calendario} popover="auto"
        role="dialog" aria-label={`Calendário de ${rotulo.toLowerCase()}`}
        onToggle={(evento) => definirValor(evento.newState === 'open' ? campo.current?.value ?? '' : null)}>
        {valor !== null && <>
          <DayPicker mode="single" locale={ptBR} weekStartsOn={0} autoFocus
            selected={selecionado} defaultMonth={selecionado} onDayClick={escolher} />
          <div className="calendario-acoes">
            <button className="link-botao" type="button" onClick={() => escolher()}>Limpar</button>
            <button className="link-botao" type="button" onClick={() => escolher(new Date())}>Hoje</button>
          </div>
        </>}
      </div>
    </div>
  </div>;
}
