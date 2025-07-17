# ncGantt

A Nextcloud app that views and updates Deck boards in a Gantt chart.

It can also be used outside of Nextcloud: Just download everything and open index.html. You need a Nextcloud App Password to be able to connect to your Deck boards (in Nexcloud go to Settings -> Security -> scroll down to Add App Password).


A Deck board like this:
grafik

is shown as a Gantt chart like that:
grafik

The time range and progress state of a card can be changed by dragging the bar or its handles with the mouse. The numbers like (6/7) next to the titles synchronize with the (number of checked/total number of checkboxes) in the description (same as in Deck). The green check mark symbol synchronize with the “Done” field of Deck. It is automatically set when the progress is changed to 100%. A red exclamation mark means delay.

Clicking on a bar opens a popup with the card description:
grafik

You can eddit the description by clicking on the pencil:
grafik

Every interaction is synchronized with Deck via the Deck API. Also changes in Deck lead to an update of the Gantt chart, so one can have both Apps open and use them simoultaneously, i.e. create a card in Deck and then move it to the right position in time in Gantt.
