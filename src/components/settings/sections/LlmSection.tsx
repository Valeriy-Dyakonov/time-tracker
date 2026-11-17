import { Field, Help } from "../../ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function LlmSection({ f }: { f: SettingsForm }) {
  return (
    <SectionCard title="Корпоративный ИИ" badge="rec">
      <Field label="Base URL" hint="Адрес API до /chat/completions, обычно заканчивается на /v1."
        tip="ИИ читает события каждого дня и решает, над какими задачами вы работали и в каких долях, а также пишет описания для списания. Подойдёт любой OpenAI-совместимый шлюз.">
        <input value={f.s.llmBaseUrl} placeholder="https://ai.company.ru/v1" onChange={(e) => f.set("llmBaseUrl", e.target.value)} />
      </Field>
      <Field label="Модель" hint="Точное имя модели, как её принимает API.">
        <input value={f.s.llmModel} onChange={(e) => f.set("llmModel", e.target.value)} />
      </Field>
      <TokenField f={f} name="llm_key" label="API key" hint="Если шлюз не требует ключ — оставьте пустым." />
      <Help
        title="Где взять адрес, модель и ключ"
        steps={[
          "Эти данные выдаёт команда, которая поддерживает корпоративный ИИ: спросите у них «адрес OpenAI-совместимого API, имя модели и API-ключ».",
          "Если вы уже пользуетесь OpenCode, те же значения обычно лежат в его конфиге opencode.json (раздел provider: baseURL, apiKey и список models). Файл ищите в папке .config\\opencode в вашем профиле Windows или в корне проекта.",
          "Список доступных моделей можно получить запросом GET <Base URL>/models.",
          "Нажмите «Проверить подключение» — приложение отправит короткий тестовый запрос.",
        ]}
        note="Без ИИ приложение тоже работает: часы распределяются эвристикой по числу действий и коммитов, но менее точно."
      />
      <TestButton f={f} svc="llm" />
    </SectionCard>
  );
}
