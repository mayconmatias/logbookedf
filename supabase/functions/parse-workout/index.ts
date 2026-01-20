// supabase/functions/parse-workout/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { text } = await req.json()
    
    // Setup Supabase
    const authHeader = req.headers.get('Authorization')!
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-ignore
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } })

    // Busca contexto de exercícios (Limitado para economia)
    const { data: existingExercises } = await supabaseClient
      .from('exercise_definitions')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(300);

    const exercisesListString = existingExercises 
      ? existingExercises.map((e: any) => `${e.name} (ID: ${e.id})`).join(', ')
      : '';

    // PROMPT ATUALIZADO PARA PROGRAMAS COMPLETOS
    const systemPrompt = `
      Você é um expert em Educação Física. Sua tarefa é estruturar programas de treino completos a partir de texto livre.

      Contexto de Exercícios Disponíveis: [${exercisesListString}]

      INSTRUÇÕES:
      1. Identifique se o texto contém um ou múltiplos treinos (Ex: "Treino A", "Treino B", "Segunda", "Terça").
      2. Agrupe os exercícios dentro de seus respectivos treinos.
      3. Para cada exercício, tente encontrar o ID correspondente na lista fornecida.
      4. Detecte técnicas avançadas no campo "set_type" ("drop", "warmup", "rest_pause", "cluster", "biset", "triset", "normal").
      5. Se o texto não especificar divisões de dias, assuma que é um "Treino Único".

      Retorne APENAS um JSON com esta estrutura:
      {
        "program_name": "Sugestão de nome para o programa",
        "days": [
          {
            "day_name": "Nome do dia (ex: Treino A - Peito)",
            "exercises": [
              {
                "definition_id": "uuid" | null,
                "name": "Nome do exercício",
                "sets": number,
                "reps": "string",
                "rpe": "string" | null,
                "notes": "string" | null,
                "set_type": "normal" | "drop" | "warmup" | "rest_pause",
                "is_unilateral": boolean
              }
            ]
          }
        ]
      }
    `

    // @ts-ignore
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    })

    const aiData = await openAIResponse.json()
    if (aiData.error) throw new Error(aiData.error.message);

    const rawContent = aiData.choices[0].message.content
    const parsedData = JSON.parse(rawContent);

    return new Response(JSON.stringify({ data: parsedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Erro' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})