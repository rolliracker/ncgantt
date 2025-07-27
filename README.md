# ncGantt

A Nextcloud app that views and updates Deck boards in a Gantt chart.


This App is under development - use it at your own risk.


It uses the [frappe-gantt library](https://github.com/frappe/gantt) and is inspired by [NxDeckGantt](https://github.com/jeobz/NxDeckGantt) and [Deck2Gantt](https://gitlab.opencode.de/wuerzburg/deck2gantt).

## Features

A Deck board like this:

![abdf89faaee239ca5429236895b7e48d0cd03e4c](https://github.com/user-attachments/assets/7ae5d7b9-86ee-4635-ba19-9e9edf48323b)


is shown as a Gantt chart like that:

<img width="2944" alt="af7e4431ff2402fee226a51848e51d8a198c1225" src="https://github.com/user-attachments/assets/c22e8017-67e8-4055-bb03-0e3e36cdc4d2" />

The time range and progress of a card can be changed by dragging the bar or its handles with the mouse. The numbers like (6/7) next to the titles synchronize with the number of checked over total number of checkboxes in the description (same as in Deck). The green check mark symbol synchronize with the “Done” field of Deck. It is automatically set when the progress is changed to 100%. A red exclamation mark denotes delay.

Clicking on a bar opens a popup with the card description:

<img width="650" alt="3b699ce4509895d77a01090fff37b3ddb5048234" src="https://github.com/user-attachments/assets/3204b594-c15d-439d-85d4-faa569520336" />

You can eddit the description by clicking on the pencil or in the text:

<img width="650"  alt="69c71d35a1e71d31115798e5bb534da08c6c9f7d" src="https://github.com/user-attachments/assets/4f0c0d46-89bc-42be-afd2-9402c613b999" />

Every interaction is synchronized with Deck via the Deck API. Also changes in Deck lead to an update of the Gantt chart, so one can have both Apps open and use them simoultaneously, i.e. create a card in Deck and then move it to the right position in time in Gantt.

### Overview of the parameters that can be viewed or edited:

||Deck show|... edit|Gantt show|... edit|
|---|---|---|---|---|
|**Due date**| :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark:  (by mouse)|
|**Start date**| :x: | :x: | :white_check_mark: | :white_check_mark:  (by mouse)|
|**Progress**| :x: | :x: | :white_check_mark: | :white_check_mark:  (by mouse)|
|**Done**| :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: (via progress) |
|**Description/Notes**| :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
|**Checkbox states**| :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
|**Task/card order**| :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: |
|**Title**| :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: |
|**Labels**| :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: |
|**Export**| ( :white_check_mark: )  (csv)| - | :white_check_mark: (json) | - |
|**Import**| :x: | - | :white_check_mark: (json) | - |

## Installation
### Outside Nextcloud

The app can be used outside of Nextcloud: Just download everything and open index.html. You should use a Nextcloud App Password to connect to your Deck boards (in Nexcloud go to Settings -> Security -> scroll down to "Add App Password"). 

### Inside Nextcloud
Connect to your Nextcloud installation. E.g. if it is in a Docker container
```
# replace "nextcloud" with the name of your container name
docker exec -it nextcloud bash
```

Install git (if not already installed):
```
apt update
apt install git -y
```

Install ncgantt app:
```
# Clone the app from github
git clone https://github.com/rolliracker/ncgantt.git /var/www/html/custom_apps/ncgantt

# Activate the app 
php occ app:enable ncgantt
```
After reloading Nextcloud in your browser you should see a Gantt icon in the app bar. If not, try to open it via https://<your-nextcloud.com>/apps/ncgantt

### Update the app inside Nextcloud
```
# Remove app directory
rm -r /var/www/html/custom_apps/ncgantt

# Clone from github
git clone https://github.com/rolliracker/ncgantt.git /var/www/html/custom_apps/ncgantt

# Deactivate 
php occ app:disable ncgantt

# Activate
php occ app:enable ncgantt
```
