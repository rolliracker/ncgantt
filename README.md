# ncGantt

A Nextcloud app that views and updates Deck boards in a Gantt chart.


It can also be used outside of Nextcloud: Just download everything and open index.html. You need a Nextcloud App Password to be able to connect to your Deck boards (in Nexcloud go to Settings -> Security -> scroll down to Add App Password).


A Deck board like this:

![abdf89faaee239ca5429236895b7e48d0cd03e4c](https://github.com/user-attachments/assets/7ae5d7b9-86ee-4635-ba19-9e9edf48323b)


is shown as a Gantt chart like that:

<img width="2944" alt="af7e4431ff2402fee226a51848e51d8a198c1225" src="https://github.com/user-attachments/assets/c22e8017-67e8-4055-bb03-0e3e36cdc4d2" />

The time range and progress state of a card can be changed by dragging the bar or its handles with the mouse. The numbers like (6/7) next to the titles synchronize with the (number of checked/total number of checkboxes) in the description (same as in Deck). The green check mark symbol synchronize with the “Done” field of Deck. It is automatically set when the progress is changed to 100%. A red exclamation mark means delay.

Clicking on a bar opens a popup with the card description:

<img width="650" alt="3b699ce4509895d77a01090fff37b3ddb5048234" src="https://github.com/user-attachments/assets/3204b594-c15d-439d-85d4-faa569520336" />

You can eddit the description by clicking on the pencil:

<img width="650"  alt="69c71d35a1e71d31115798e5bb534da08c6c9f7d" src="https://github.com/user-attachments/assets/4f0c0d46-89bc-42be-afd2-9402c613b999" />

Every interaction is synchronized with Deck via the Deck API. Also changes in Deck lead to an update of the Gantt chart, so one can have both Apps open and use them simoultaneously, i.e. create a card in Deck and then move it to the right position in time in Gantt.


