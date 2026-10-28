/* Topics group the Assignment page into sections, like Google Classroom's
   "Homework 8". A topic is just a short label on the assignment: typing a
   new one makes it, and a topic with nothing left in it is simply not shown
   any more. Leaving it blank means "No topic". */

const TOPIC_MAX = 80;

/** The cleaned topic: null for none, or { error } when it is too long. */
function cleanTopic(value) {
  const topic = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!topic) return null;
  if (topic.length > TOPIC_MAX) return { error: `Keep the topic under ${TOPIC_MAX} characters` };
  return topic;
}

module.exports = { cleanTopic, TOPIC_MAX };
