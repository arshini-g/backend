const fetch = require('node-fetch');

const SUPABASE_URL = "https://zxughqbbxmpxbrbtkeak.supabase.co";
const API_ENDPOINT = "/rest/v1/tasks";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dWdocWJieG1weGJyYnRrZWFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzkwMDk1OCwiZXhwIjoyMDQ5NDc2OTU4fQ.1ogJuqSJQCaFRsw9oPQ5ov1_AggIViofD46y5nJN52Y";

async function addTask(userId, taskTitle, taskDescription) {
  const BASE_URL = `${SUPABASE_URL}${API_ENDPOINT}`;

  const taskData = {
    user_id: userId,
    task_title: taskTitle,
    task_description: taskDescription,
    status: 'pending'
  };

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskData)
    });

    if (!response.ok) {
      if (response.status === 409) {
        console.warn('Conflict - Task already exists.');
        return;
      } else {
        console.error(`Error adding task: ${response.statusText}`);
        return;
      }
    }
  } catch (error) {
    console.error('Error in addTask:', error.message);
    return;
  }
}

// Example usage
const userId = 123456;
const taskTitle = 'new feature';
const taskDescription = 'Add f6';

addTask(userId, taskTitle, taskDescription);
