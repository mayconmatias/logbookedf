// supabase/functions/parse-workout/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// [CORREÇÃO] Tipagem explícita para 'req'
serve(async (req: Request) => {
  // 1. Handle CORS (Preflight request)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text } = await req.json()
    
    // 2. Setup Supabase Client
    const authHeader = req.headers.get('Authorization')!
    
    // [CORREÇÃO] Deno é global no ambiente Edge, o VSCode reclama mas funciona no deploy
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-ignore
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseKey,
      { global: { headers: { Authorization: authHeader } } }
    )

    // 3. Buscar exercícios existentes
    const { data: existingExercises } = await supabaseClient
      .from('exercise_definitions')
      .select('id, name')
      .order('name', { ascending: true });

    // [CORREÇÃO] Tipagem no map
    const exercisesListString = existingExercises 
      ? existingExercises.map((e: any) => `${e.name} (ID: ${e.id})`).join(', ')
      : '';

    // 4. Preparar o Prompt
    const systemPrompt = `
      Você é um assistente especialista em educação física. Sua tarefa é converter texto livre de treinos em JSON estruturado.
      
      Instruções:
      1. Identifique os exercícios, séries, repetições (range ou fixo), RPE e notas técnicas.
      2. Tente combinar o nome do exercício com esta lista existente: [${exercisesListString}].
      3. Se encontrar um match na lista (mesmo que aproximado), use o "definition_id" correspondente e o nome exato da lista.
      4. Se NÃO encontrar, deixe "definition_id" null e use o nome extraído do texto.
      5. Retorne APENAS um JSON válido no formato: 
      [
        {
          "definition_id": "uuid" | null,
          "name": "string",
          "sets": number,
          "reps": "string",
          "rpe": "string" | null,
          "notes": "string" | null
        }
      ]
    `

    // 5. Chamar OpenAI
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
        temperature: 0.1
      })
    })

    const aiData = await openAIResponse.json()
    
    // Tratamento de erro da OpenAI
    if (aiData.error) {
        throw new Error(aiData.error.message);
    }

    const rawContent = aiData.choices[0].message.content

    const jsonString = rawContent.replace(/```json/g, '').replace(/```/g, '').trim()
    const parsedWorkout = JSON.parse(jsonString)

    return new Response(JSON.stringify({ data: parsedWorkout }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) { // [CORREÇÃO] Tipagem do erro como 'any' para acessar .message
    const errorMessage = error?.message || 'Erro desconhecido na Edge Function';
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})