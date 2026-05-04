
async function answerQuestion() {
  const payload = {
    questionId: "693pZqxQ9FvZ2FXn33sn",
    response: "weather is fine",
    creatorId: "eZAZfVS1E5eHNfFLUClscFOLeU02",
    answerType: "text",
    attachmentUrls: [
      "C:\\Users\\sidha\\Downloads\\1.mp4",
      "C:\\Users\\sidha\\Downloads\\screencapture-play-google-console-u-1-developers-6566705826145218174-paymentssettings-2026-04-22-15_11_17.png",
      "C:\\Users\\sidha\\Downloads\\2.broke.girls.S02E02.LOL.English-WWW.MY-SUBS.CO.srt"
    ]
  };

  const response = await fetch('http://localhost:3000/api/questions/answer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  console.log('Result:', result);
  process.exit(0);
}

answerQuestion().catch(err => {
  console.error(err);
  process.exit(1);
});
