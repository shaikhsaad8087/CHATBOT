from langchain_core import chat_history
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from dotenv import load_dotenv

load_dotenv()


# Add model name
model = ChatGroq(model="llama-3.1-8b-instant")
   
chat_history = [
    SystemMessage(content="""
You are a helpful AI assistant.

- By default, give short answers (1-2 sentences).
- If the user asks for explanation, details, or says words like "explain", "why", "how", "in detail", then give a longer answer.
- Always match the user's intent.
""")
]

while True:
    user_input = input("You: ")
    chat_history.append(HumanMessage(content=user_input)) 
    if user_input == "exit":
        break

    result = model.invoke(chat_history)
    chat_history.append(AIMessage(content=result.content))
    print("Bot:", result.content)

print(chat_history)



