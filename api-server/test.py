#api_key = "AIzaSyA0fe2PnfjRA96rk6X4RRvXdJPP87-EDAI"
import requests

api_key = "AIzaSyA0fe2PnfjRA96rk6X4RRvXdJPP87-EDAI"
endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

headers = { "Content-Type": "application/json" }
payload = {
    "contents": [
        {
            "parts": [
                { "text": "Tell me about Aryan Awasthi's background and AI projects." }
            ]
        }
    ]
}

response = requests.post(endpoint, headers=headers, json=payload)

print("Status Code:", response.status_code)

try:
    data = response.json()
    print("Full response:", data)

    if "candidates" in data:
        reply = data["candidates"][0]["content"]["parts"][0]["text"]
        print("\n💬 Gemini says:", reply)
    elif "error" in data:
        print("\n❌ Error from Gemini:", data["error"]["message"])
    else:
        print("\n⚠️ Unexpected response format.")

except Exception as e:
    print("⚠️ Failed to parse JSON response:", e)
    print("Raw response text:", response.text)

