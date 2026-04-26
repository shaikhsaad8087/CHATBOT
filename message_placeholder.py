from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# chat template 
chat_template = ChatPromptTemplate(
    [
         ('system','you area helpful customer support agent'),
         MessagesPlaceholder(variable_name='chat_history'),
         ('human','{query}')
    ]
)

chat_history = []
# load caht history

with open('chat_history.txt') as f:
    chat_history.extend(f.readlines())

print(chat_history)


prompt = chat_template.invoke(
    {
        'chat_history' : chat_history,
        'query' :HumanMessage(content="give me detail about refund process") 
    })

print(prompt)
