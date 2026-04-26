# from langchain_core.prompts import ChatPromptTemplate

# chat_template = ChatPromptTemplate([
#     ('system', 'you  are a helpfull {domain} expert'),
#     ('human', 'Explain in simple terms, what is {topic}'),
# ])

# prompt = chat_template.invoke({"domain" : 'cricket' , 'topic' : 'Dusra'})
# print(prompt)

from langchain_core.prompts import ChatPromptTemplate

chat_template = ChatPromptTemplate.from_messages([
    ("system", "you are a helpfull {domain} expert"), 
    ("human", "Explain in simple terms, what is {topic}")
])

# 👇 Take input from user
domain = input("Enter domain (e.g. cricket, science): ")
topic = input("Enter topic: ")

prompt = chat_template.invoke({
    "domain": domain,
    "topic": topic
})

print(prompt)
